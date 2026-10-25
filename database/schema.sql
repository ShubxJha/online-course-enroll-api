IF DB_ID(N'course_enrollment') IS NULL
    CREATE DATABASE course_enrollment;
GO

USE course_enrollment;
GO

IF OBJECT_ID(N'dbo.Students', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Students (
        student_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Students PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        email NVARCHAR(254) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Students_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Students_email UNIQUE (email)
    );
END;
GO

IF OBJECT_ID(N'dbo.Courses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Courses (
        course_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Courses PRIMARY KEY,
        code NVARCHAR(20) NOT NULL,
        title NVARCHAR(160) NOT NULL,
        description NVARCHAR(1000) NULL,
        capacity INT NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Courses_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Courses_code UNIQUE (code),
        CONSTRAINT CK_Courses_capacity CHECK (capacity > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.Enrollments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Enrollments (
        enrollment_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Enrollments PRIMARY KEY,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        enrolled_at DATETIME2(0) NOT NULL CONSTRAINT DF_Enrollments_enrolled_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Enrollments_Students FOREIGN KEY (student_id) REFERENCES dbo.Students(student_id) ON DELETE CASCADE,
        CONSTRAINT FK_Enrollments_Courses FOREIGN KEY (course_id) REFERENCES dbo.Courses(course_id) ON DELETE CASCADE,
        CONSTRAINT UQ_Enrollments_student_course UNIQUE (student_id, course_id)
    );
    CREATE INDEX IX_Enrollments_course_id ON dbo.Enrollments(course_id);
    CREATE INDEX IX_Enrollments_student_id ON dbo.Enrollments(student_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Students WHERE email = N'shubham@example.edu')
    INSERT dbo.Students (name, email) VALUES (N'Shubham Jha', N'aarav@example.edu');
IF NOT EXISTS (SELECT 1 FROM dbo.Students WHERE email = N'himanshu@example.edu')
    INSERT dbo.Students (name, email) VALUES (N'Himanshu Patel', N'isha@example.edu');
IF NOT EXISTS (SELECT 1 FROM dbo.Courses WHERE code = N'CS101')
    INSERT dbo.Courses (code, title, description, capacity) VALUES (N'CS101', N'Introduction to Programming', N'Programming fundamentals and problem solving.', 2);
IF NOT EXISTS (SELECT 1 FROM dbo.Courses WHERE code = N'DB201')
    INSERT dbo.Courses (code, title, description, capacity) VALUES (N'DB201', N'Database Systems', N'Relational data modeling and SQL.', 1);
GO
