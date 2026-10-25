# Practical 2 - Online Course Enrollment API

An Express REST API using MySQL for students, courses, and course enrollments. It reports course capacity, prevents duplicate or over-capacity enrollment, supports cancellation, and uses an InnoDB transaction with a course-row lock to keep seat counts consistent.

## Requirements

- Node.js 20 or newer
- MySQL 8.0.19 or newer

## Setup

1. Run `database/schema.sql` in MySQL Workbench or the MySQL command line. It creates the `course_enrollment` database and tables, then adds two sample students and courses.
2. Copy `.env.example` to `.env` and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` for your MySQL server.
3. Install packages with `npm install`.
4. Start with `npm start` (or `npm run dev` during development).
5. Check `GET http://localhost:3000/health` for `{"status":"ok","database":"connected"}`.
6. Import `postman/course-enrollment.postman_collection.json` into Postman. The sample database IDs start at 1 in a fresh database; update the collection variables if your data uses different IDs.

## API

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/students` | List students | 200 |
| POST | `/api/students` | Add a student | 201 |
| GET | `/api/courses` | List courses and remaining seats | 200 |
| POST | `/api/courses` | Add a course | 201 |
| POST | `/api/enrollments` | Enroll a student in a course | 201 |
| GET | `/api/students/:id/enrollments` | List courses for a student | 200 |
| DELETE | `/api/enrollments/:id` | Cancel an enrollment | 200 |

### Examples

Create a student:

```json
{ "name": "Aarav Mehta", "email": "aarav@example.edu" }
```

Create a course:

```json
{ "code": "CS101", "title": "Introduction to Programming", "description": "Programming fundamentals.", "capacity": 30 }
```

Enroll:

```json
{ "student_id": 1, "course_id": 1 }
```

Invalid fields return 400, missing student/course/enrollment returns 404, duplicate email/code or enrollment and a full course return 409. Database values are parameterized. Unique constraints are also enforced in MySQL.
