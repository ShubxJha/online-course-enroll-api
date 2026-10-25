require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && (req.body === null || Array.isArray(req.body) || typeof req.body !== 'object')) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }
  return next();
});

const positiveId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0 && Number.isSafeInteger(Number(value));
const requiredText = (body, fields) => {
  const errors = [];
  for (const field of fields) if (typeof body[field] !== 'string' || !body[field].trim()) errors.push(`${field} must be a non-empty string`);
  return errors;
};
const emailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const idError = (res, label) => res.status(400).json({ error: `${label} must be a positive integer.` });

function handleDatabaseError(error, res, next) {
  if (error && error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with that unique value already exists.' });
  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'The referenced student or course does not exist.' });
  return next(error);
}

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) { next(error); }
});

app.get('/api/students', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT student_id, name, email, created_at FROM Students ORDER BY student_id');
    res.json({ data: rows });
  } catch (error) { next(error); }
});

app.post('/api/students', async (req, res, next) => {
  const errors = requiredText(req.body, ['name', 'email']);
  if (!errors.length && !emailValid(req.body.email.trim())) errors.push('email must be a valid email address');
  if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });
  try {
    const [result] = await pool.execute('INSERT INTO Students (name, email) VALUES (?, ?)', [
      req.body.name.trim(), req.body.email.trim().toLowerCase()
    ]);
    const [rows] = await pool.execute(
      'SELECT student_id, name, email, created_at FROM Students WHERE student_id = ?', [result.insertId]
    );
    res.status(201).json({ message: 'Student created.', data: rows[0] });
  } catch (error) { handleDatabaseError(error, res, next); }
});

app.get('/api/courses', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.course_id, c.code, c.title, c.description, c.capacity,
        COUNT(e.enrollment_id) AS enrolled_count,
        c.capacity - COUNT(e.enrollment_id) AS remaining_seats
      FROM Courses c LEFT JOIN Enrollments e ON e.course_id = c.course_id
      GROUP BY c.course_id, c.code, c.title, c.description, c.capacity
      ORDER BY c.course_id`);
    res.json({ data: rows });
  } catch (error) { next(error); }
});

app.post('/api/courses', async (req, res, next) => {
  const errors = requiredText(req.body, ['code', 'title']);
  if (req.body.description !== undefined && req.body.description !== null && typeof req.body.description !== 'string') errors.push('description must be a string');
  if (!Number.isInteger(req.body.capacity) || req.body.capacity < 1) errors.push('capacity must be a positive integer');
  if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });
  try {
    const [result] = await pool.execute('INSERT INTO Courses (code, title, description, capacity) VALUES (?, ?, ?, ?)', [
      req.body.code.trim().toUpperCase(), req.body.title.trim(), req.body.description?.trim() || null, req.body.capacity
    ]);
    const [rows] = await pool.execute(
      'SELECT course_id, code, title, description, capacity FROM Courses WHERE course_id = ?', [result.insertId]
    );
    res.status(201).json({ message: 'Course created.', data: { ...rows[0], enrolled_count: 0, remaining_seats: req.body.capacity } });
  } catch (error) { handleDatabaseError(error, res, next); }
});

app.post('/api/enrollments', async (req, res, next) => {
  const errors = [];
  for (const field of ['student_id', 'course_id']) if (!positiveId(req.body[field])) errors.push(`${field} must be a positive integer`);
  if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });

  let connection;
  let transactionOpen = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;
    const studentId = Number(req.body.student_id);
    const courseId = Number(req.body.course_id);

    const [students] = await connection.execute('SELECT student_id FROM Students WHERE student_id = ?', [studentId]);
    if (!students.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Lock the course row so simultaneous registrations cannot exceed capacity.
    const [courses] = await connection.execute('SELECT course_id, capacity FROM Courses WHERE course_id = ? FOR UPDATE', [courseId]);
    if (!courses.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(404).json({ error: 'Course not found.' });
    }

    const [existing] = await connection.execute(
      'SELECT enrollment_id FROM Enrollments WHERE student_id = ? AND course_id = ?', [studentId, courseId]
    );
    if (existing.length) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(409).json({ error: 'Student is already enrolled in this course.' });
    }

    const [[{ enrolled_count: enrolledCount }]] = await connection.execute(
      'SELECT COUNT(*) AS enrolled_count FROM Enrollments WHERE course_id = ?', [courseId]
    );
    if (enrolledCount >= courses[0].capacity) {
      await connection.rollback();
      transactionOpen = false;
      return res.status(409).json({ error: 'Course is full.' });
    }

    const [inserted] = await connection.execute('INSERT INTO Enrollments (student_id, course_id) VALUES (?, ?)', [studentId, courseId]);
    const [rows] = await connection.execute(
      'SELECT enrollment_id, student_id, course_id, enrolled_at FROM Enrollments WHERE enrollment_id = ?', [inserted.insertId]
    );
    await connection.commit();
    transactionOpen = false;
    res.status(201).json({ message: 'Enrollment created.', data: rows[0] });
  } catch (error) {
    if (transactionOpen) await connection.rollback().catch(() => {});
    handleDatabaseError(error, res, next);
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/students/:id/enrollments', async (req, res, next) => {
  if (!positiveId(req.params.id)) return idError(res, 'Student ID');
  try {
    const [rows] = await pool.execute(`
      SELECT s.student_id, s.name AS student_name, c.course_id, c.code, c.title,
        c.description, e.enrollment_id, e.enrolled_at
      FROM Students s
      LEFT JOIN Enrollments e ON e.student_id = s.student_id
      LEFT JOIN Courses c ON c.course_id = e.course_id
      WHERE s.student_id = ? ORDER BY c.course_id`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Student not found.' });
    const courses = rows.filter((row) => row.course_id !== null).map(({ course_id, code, title, description, enrollment_id, enrolled_at }) => ({
      course_id, code, title, description, enrollment_id, enrolled_at
    }));
    res.json({ data: { student_id: rows[0].student_id, student_name: rows[0].student_name, courses } });
  } catch (error) { next(error); }
});

app.delete('/api/enrollments/:id', async (req, res, next) => {
  if (!positiveId(req.params.id)) return idError(res, 'Enrollment ID');
  try {
    const [result] = await pool.execute('DELETE FROM Enrollments WHERE enrollment_id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Enrollment not found.' });
    res.json({ message: 'Enrollment cancelled.', enrollment_id: Number(req.params.id) });
  } catch (error) { next(error); }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(port, () => console.log(`Course Enrollment API listening at http://localhost:${port}`));
async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
