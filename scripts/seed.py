"""CampusFlow Database Seeder.

Populates a comprehensive, realistic demo dataset including departments,
programs, batches, terms, users across all roles, courses, offerings,
enrollments, announcements, materials, assignments, submissions with grades,
question banks, questions of multiple types, exams, attempts, proctoring events,
and institutional settings.

Run via:
    uv run python scripts/seed.py
or from backend:
    uv run python ../scripts/seed.py
"""

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

# Ensure backend package is in python path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

# Ensure utf-8 encoding on Windows console
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sqlalchemy import select  # noqa: E402
from campusflow.bedrock.db.session import async_session_factory  # noqa: E402
from campusflow.bedrock.rbac.service import seed_roles_and_permissions  # noqa: E402
from campusflow.domain.institution.service import get_or_create_default_institution  # noqa: E402
from campusflow.domain.users.models import User  # noqa: E402
from campusflow.domain.users.schemas import UserCreate  # noqa: E402
from campusflow.domain.users.service import create_user  # noqa: E402
from campusflow.domain.academic_terms.models import AcademicTerm  # noqa: E402
from campusflow.domain.departments.models import (  # noqa: E402
    Department,
    Program,
    Batch,
)
from campusflow.domain.courses.models import (  # noqa: E402
    Course,
    CourseOffering,
    FacultyAssignment,
)
from campusflow.domain.enrollments.models import Enrollment  # noqa: E402
from campusflow.domain.announcements.models import Announcement  # noqa: E402
from campusflow.domain.materials.models import MaterialFolder, Material  # noqa: E402
from campusflow.domain.assignments.models import (  # noqa: E402
    Assignment,
    AssignmentSubmission,
    SubmissionGrade,
)
from campusflow.domain.question_banks.models import (  # noqa: E402
    QuestionBank,
    Question,
    QuestionOption,
)
from campusflow.domain.exams.models import (  # noqa: E402
    Exam,
    ExamQuestion,
    ExamAttempt,
    ProctoringEvent,
)
from campusflow.domain.notifications.models import NotificationPreference  # noqa: E402


async def seed():
    print("[*] Starting CampusFlow comprehensive database seeding...")
    now = datetime.now(timezone.utc)

    async with async_session_factory() as session:
        # 1. System Roles, Permissions, & Institution
        print("  -> Seeding roles and permissions...")
        await seed_roles_and_permissions(session)

        print("  -> Initializing institutional settings...")
        institution = await get_or_create_default_institution(session)
        institution.name = "Apex Institute of Technology"
        institution.code = "AIT"
        institution.primary_color = "#2563eb"
        institution.timezone = "America/New_York"
        institution.contact_email = "registrar@ait.edu"
        institution.phone = "+1 (555) 019-2834"
        await session.commit()

        # 2. Users Provisioning
        print("  -> Provisioning users across all roles...")
        users_meta = [
            ("admin@campusflow.edu", "Admin@CampusFlow2026", "System", "Administrator", ["super_admin", "admin"]),
            ("controller@campusflow.edu", "Password@123", "Eleanor", "Vance", ["exam_controller"]),
            ("hod.cse@campusflow.edu", "Password@123", "Marcus", "Sterling", ["department_head", "faculty"]),
            ("faculty.cse@campusflow.edu", "Password@123", "Sarah", "Chen", ["faculty"]),
            ("faculty.mech@campusflow.edu", "Password@123", "Robert", "Davies", ["faculty"]),
            ("student1@campusflow.edu", "Password@123", "Alex", "Rivera", ["student"]),
            ("student2@campusflow.edu", "Password@123", "Brianna", "Patel", ["student"]),
            ("student3@campusflow.edu", "Password@123", "Carlos", "Gomez", ["student"]),
            ("student4@campusflow.edu", "Password@123", "Diana", "Prince", ["student"]),
        ]

        users = {}
        for email, pwd, fn, ln, roles in users_meta:
            res = await session.execute(select(User).where(User.email == email))
            existing = res.scalar_one_or_none()
            if not existing:
                u = await create_user(
                    session,
                    UserCreate(
                        email=email,
                        password=pwd,
                        first_name=fn,
                        last_name=ln,
                        roles=roles,
                        status="active",
                    ),
                )
                users[email] = u
            else:
                users[email] = existing

            # Notification preferences
            pref_res = await session.execute(
                select(NotificationPreference).where(NotificationPreference.user_id == users[email].id)
            )
            if not pref_res.scalar_one_or_none():
                session.add(NotificationPreference(user_id=users[email].id))

        await session.commit()

        # 3. Academic Structure
        print("  -> Creating departments, programs, batches, and terms...")
        async def get_or_create_dept(name, code, head_user=None):
            res = await session.execute(select(Department).where(Department.code == code))
            dept = res.scalar_one_or_none()
            if not dept:
                dept = Department(
                    name=name,
                    code=code,
                    description=f"{name} Department",
                    head_id=head_user.id if head_user else None,
                )
                session.add(dept)
                await session.flush()
            return dept

        dept_cse = await get_or_create_dept("Computer Science & Engineering", "CSE", users["hod.cse@campusflow.edu"])
        dept_mech = await get_or_create_dept("Mechanical Engineering", "MECH")

        async def get_or_create_prog(name, code, dept_id):
            res = await session.execute(select(Program).where(Program.code == code))
            p = res.scalar_one_or_none()
            if not p:
                p = Program(name=name, code=code, department_id=dept_id, degree_type="Bachelor", duration_years=4)
                session.add(p)
                await session.flush()
            return p

        prog_cse = await get_or_create_prog("B.Tech in Computer Science", "BTECH-CSE", dept_cse.id)
        await get_or_create_prog("B.Tech in Mechanical Engineering", "BTECH-MECH", dept_mech.id)

        async def get_or_create_batch(label, year, prog_id):
            res = await session.execute(select(Batch).where(Batch.label == label, Batch.program_id == prog_id))
            b = res.scalar_one_or_none()
            if not b:
                b = Batch(label=label, start_year=year, program_id=prog_id)
                session.add(b)
                await session.flush()
            return b

        batch_2026 = await get_or_create_batch("Class of 2026", 2022, prog_cse.id)

        async def get_or_create_term(name, is_current=False):
            res = await session.execute(select(AcademicTerm).where(AcademicTerm.name == name))
            t = res.scalar_one_or_none()
            if not t:
                t = AcademicTerm(
                    name=name,
                    term_type="semester",
                    start_date=(now - timedelta(days=30)).date(),
                    end_date=(now + timedelta(days=90)).date(),
                    is_current=is_current,
                )
                session.add(t)
                await session.flush()
            return t

        term_fall = await get_or_create_term("Fall Semester 2026", is_current=True)
        await get_or_create_term("Spring Semester 2027", is_current=False)

        await session.commit()

        # 4. Courses & Offerings
        print("  -> Creating courses, offerings, and enrollments...")
        async def get_or_create_course(title, code, credits_val, dept_id):
            res = await session.execute(select(Course).where(Course.code == code))
            c = res.scalar_one_or_none()
            if not c:
                c = Course(title=title, code=code, credits=credits_val, department_id=dept_id)
                session.add(c)
                await session.flush()
            return c

        course_dsa = await get_or_create_course("Data Structures & Algorithms", "CS201", 4, dept_cse.id)
        course_dbms = await get_or_create_course("Database Management Systems", "CS301", 3, dept_cse.id)
        await get_or_create_course("Engineering Thermodynamics", "ME101", 4, dept_mech.id)

        async def get_or_create_offering(course_id, term_id, batch_id, faculty_user):
            res = await session.execute(
                select(CourseOffering).where(
                    CourseOffering.course_id == course_id,
                    CourseOffering.academic_term_id == term_id,
                )
            )
            off = res.scalar_one_or_none()
            if not off:
                off = CourseOffering(
                    course_id=course_id,
                    academic_term_id=term_id,
                    batch_id=batch_id,
                    section="Section A",
                    status="active",
                )
                session.add(off)
                await session.flush()

                fa = FacultyAssignment(
                    course_offering_id=off.id,
                    faculty_id=faculty_user.id,
                    role="primary",
                )
                session.add(fa)
                await session.flush()
            return off

        offering_dsa = await get_or_create_offering(course_dsa.id, term_fall.id, batch_2026.id, users["faculty.cse@campusflow.edu"])
        offering_dbms = await get_or_create_offering(course_dbms.id, term_fall.id, batch_2026.id, users["faculty.cse@campusflow.edu"])

        # Enrollments
        for s_email in ["student1@campusflow.edu", "student2@campusflow.edu", "student3@campusflow.edu"]:
            res = await session.execute(
                select(Enrollment).where(
                    Enrollment.course_offering_id == offering_dsa.id,
                    Enrollment.student_id == users[s_email].id,
                )
            )
            if not res.scalar_one_or_none():
                session.add(
                    Enrollment(
                        course_offering_id=offering_dsa.id,
                        student_id=users[s_email].id,
                        status="enrolled",
                    )
                )

        for s_email in ["student1@campusflow.edu", "student2@campusflow.edu"]:
            res = await session.execute(
                select(Enrollment).where(
                    Enrollment.course_offering_id == offering_dbms.id,
                    Enrollment.student_id == users[s_email].id,
                )
            )
            if not res.scalar_one_or_none():
                session.add(
                    Enrollment(
                        course_offering_id=offering_dbms.id,
                        student_id=users[s_email].id,
                        status="enrolled",
                    )
                )

        # Announcements
        res_ann = await session.execute(
            select(Announcement).where(Announcement.course_offering_id == offering_dsa.id)
        )
        if not res_ann.scalars().first():
            session.add(
                Announcement(
                    course_offering_id=offering_dsa.id,
                    author_id=users["faculty.cse@campusflow.edu"].id,
                    title="Welcome to Data Structures & Algorithms",
                    body="Welcome class! Please review the syllabus in Materials and setup your local C++/Python environment.",
                    is_pinned=True,
                )
            )
            session.add(
                Announcement(
                    course_offering_id=offering_dsa.id,
                    author_id=users["faculty.cse@campusflow.edu"].id,
                    title="Midterm Examination Logistics & Schedule",
                    body="The Midterm will cover Binary Trees, Heaps, and Graph Traversals. Secure proctoring will be active.",
                    is_pinned=False,
                )
            )

        # Materials & Folders
        res_fold = await session.execute(
            select(MaterialFolder).where(MaterialFolder.course_offering_id == offering_dsa.id)
        )
        fold = res_fold.scalars().first()
        if not fold:
            fold = MaterialFolder(
                course_offering_id=offering_dsa.id,
                title="Lecture Notes & Readings",
                sort_order=1,
            )
            session.add(fold)
            await session.flush()

            session.add(
                Material(
                    course_offering_id=offering_dsa.id,
                    folder_id=fold.id,
                    title="Module 1: Binary Search Trees & Self-Balancing Trees",
                    material_type="url",
                    url="https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-006-introduction-to-algorithms-fall-2011/lecture-videos/lecture-5-binary-search-trees-bst-sort/",
                )
            )

        await session.commit()

        # 5. Assignments & Submissions
        print("  -> Creating assignments, submissions, and grades...")
        res_asg = await session.execute(
            select(Assignment).where(Assignment.course_offering_id == offering_dsa.id)
        )
        asg = res_asg.scalars().first()
        if not asg:
            asg = Assignment(
                course_offering_id=offering_dsa.id,
                title="Programming Assignment 1: AVL Tree Implementation",
                description="Implement an AVL tree with insertion, deletion, and rotation balancing. Submit your source file or writeup.",
                total_marks=100.0,
                weightage=20.0,
                due_date=now - timedelta(days=2),
                allow_late=True,
                late_penalty_percent_per_day=5.0,
                is_published=True,
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(asg)
            await session.flush()

            # Submission for student 1 (graded)
            sub1 = AssignmentSubmission(
                assignment_id=asg.id,
                student_id=users["student1@campusflow.edu"].id,
                content_text="Self-balancing AVL tree implemented with left and right rotation logic. All rotation test cases pass.",
                status="graded",
                submitted_at=now - timedelta(days=3),
            )
            session.add(sub1)
            await session.flush()

            grade1 = SubmissionGrade(
                submission_id=sub1.id,
                graded_by_id=users["faculty.cse@campusflow.edu"].id,
                marks_obtained=95.0,
                penalty_deducted=0.0,
                final_marks=95.0,
                feedback="Excellent implementation with clean invariant assertions and complete rotation test coverage.",
                graded_at=now - timedelta(days=1),
            )
            session.add(grade1)

            # Submission for student 2 (graded)
            sub2 = AssignmentSubmission(
                assignment_id=asg.id,
                student_id=users["student2@campusflow.edu"].id,
                content_text="Implemented AVL rotations and insertion tests.",
                status="graded",
                submitted_at=now - timedelta(days=3),
            )
            session.add(sub2)
            await session.flush()

            grade2 = SubmissionGrade(
                submission_id=sub2.id,
                graded_by_id=users["faculty.cse@campusflow.edu"].id,
                marks_obtained=88.0,
                penalty_deducted=0.0,
                final_marks=88.0,
                feedback="Great work overall. Slight balance factor edge case noted during double-rotations.",
                graded_at=now - timedelta(days=1),
            )
            session.add(grade2)

            # Submission for student 3 (submitted, pending review)
            sub3 = AssignmentSubmission(
                assignment_id=asg.id,
                student_id=users["student3@campusflow.edu"].id,
                content_text="AVL tree node balancing and height calculation implemented.",
                status="submitted",
                submitted_at=now - timedelta(hours=12),
            )
            session.add(sub3)

        await session.commit()

        # 6. Question Bank & Questions
        print("  -> Creating question banks and comprehensive question inventory...")
        res_qb = await session.execute(
            select(QuestionBank).where(QuestionBank.title == "DSA Master Question Repository")
        )
        qb = res_qb.scalar_one_or_none()
        if not qb:
            qb = QuestionBank(
                title="DSA Master Question Repository",
                description="Core algorithms question bank containing trees, graphs, sorting, and dynamic programming.",
                department_id=dept_cse.id,
                course_id=course_dsa.id,
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(qb)
            await session.flush()

            # Q1: MCQ Single
            q1 = Question(
                question_bank_id=qb.id,
                body="What is the worst-case time complexity of searching for an element in an unbalanced Binary Search Tree?",
                question_type="mcq",
                difficulty="medium",
                marks=2.0,
                negative_marks=0.5,
                explanation="In an unbalanced BST (degenerate tree like a linked list), the search path can traverse all n nodes.",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q1)
            await session.flush()
            session.add_all([
                QuestionOption(question_id=q1.id, label="A", body="O(1)", is_correct=False, sort_order=1),
                QuestionOption(question_id=q1.id, label="B", body="O(log n)", is_correct=False, sort_order=2),
                QuestionOption(question_id=q1.id, label="C", body="O(n)", is_correct=True, sort_order=3),
                QuestionOption(question_id=q1.id, label="D", body="O(n log n)", is_correct=False, sort_order=4),
            ])

            # Q2: MSQ Multiple
            q2 = Question(
                question_bank_id=qb.id,
                body="Which of the following are self-balancing search trees? (Select all that apply)",
                question_type="msq",
                difficulty="medium",
                marks=3.0,
                negative_marks=0.0,
                explanation="AVL Trees, Red-Black Trees, and B-Trees maintain logarithmic height guarantees through rebalancing rotations or node splitting.",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q2)
            await session.flush()
            session.add_all([
                QuestionOption(question_id=q2.id, label="A", body="AVL Tree", is_correct=True, sort_order=1),
                QuestionOption(question_id=q2.id, label="B", body="Red-Black Tree", is_correct=True, sort_order=2),
                QuestionOption(question_id=q2.id, label="C", body="Min-Heap", is_correct=False, sort_order=3),
                QuestionOption(question_id=q2.id, label="D", body="B-Tree", is_correct=True, sort_order=4),
            ])

            # Q3: True/False
            q3 = Question(
                question_bank_id=qb.id,
                body="Dijkstra's shortest path algorithm correctly determines minimum path weights in graphs containing negative edge weights.",
                question_type="true_false",
                difficulty="easy",
                marks=1.0,
                negative_marks=0.25,
                explanation="False. Dijkstra assumes non-negative weights; graphs with negative edges require the Bellman-Ford algorithm.",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q3)
            await session.flush()
            session.add_all([
                QuestionOption(question_id=q3.id, label="A", body="True", is_correct=False, sort_order=1),
                QuestionOption(question_id=q3.id, label="B", body="False", is_correct=True, sort_order=2),
            ])

            # Q4: Numerical
            q4 = Question(
                question_bank_id=qb.id,
                body="In a complete binary tree containing exactly 15 nodes, what is the height of the tree? (Root is at height 0)",
                question_type="numerical",
                difficulty="medium",
                marks=2.0,
                negative_marks=0.0,
                metadata_info={"correct_answer": 3.0, "tolerance": 0.0},
                explanation="Height = floor(log2(15)) = 3 (levels 0, 1, 2, 3).",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q4)

            # Q5: Fill in Blank
            q5 = Question(
                question_bank_id=qb.id,
                body="The fundamental linear data structure used to implement Breadth-First Search (BFS) traversal is a ______.",
                question_type="fill_blank",
                difficulty="easy",
                marks=2.0,
                negative_marks=0.0,
                metadata_info={"accepted_answers": ["queue", "FIFO queue"]},
                explanation="BFS operates in FIFO order, discovering nodes level-by-level using a queue.",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q5)

            # Q6: Short Answer
            q6 = Question(
                question_bank_id=qb.id,
                body="Briefly explain the primary structural difference between a Binary Search Tree (BST) and a Min-Heap.",
                question_type="short_answer",
                difficulty="medium",
                marks=5.0,
                explanation="A BST maintains horizontal ordering (left < root < right), while a Min-Heap maintains vertical hierarchical ordering (parent <= children) with shape completeness.",
                status="approved",
                created_by_id=users["faculty.cse@campusflow.edu"].id,
            )
            session.add(q6)
            await session.flush()

        await session.commit()

        # 7. Examination Core & Completed Demo Exam
        print("  -> Creating examinations, attempt history, proctoring events, and scores...")
        res_exam = await session.execute(
            select(Exam).where(Exam.title == "CS201 Midterm Examination: Data Structures")
        )
        exam = res_exam.scalar_one_or_none()
        if not exam:
            exam = Exam(
                title="CS201 Midterm Examination: Data Structures",
                description="Comprehensive midterm covering trees, heaps, search complexity, and traversal algorithms.",
                course_offering_id=offering_dsa.id,
                created_by_id=users["faculty.cse@campusflow.edu"].id,
                exam_type="midterm",
                duration_minutes=60,
                total_marks=15.0,
                passing_marks=7.5,
                start_window=now - timedelta(days=2),
                end_window=now + timedelta(days=1),
                config={"proctoring_enabled": True, "max_violations": 5, "shuffle_questions": False},
                status="published",
            )
            session.add(exam)
            await session.flush()

            # Attach questions to exam
            questions_res = await session.execute(
                select(Question).where(Question.question_bank_id == qb.id).order_by(Question.created_at.asc())
            )
            exam_qs = questions_res.scalars().all()
            for idx, q in enumerate(exam_qs):
                session.add(
                    ExamQuestion(
                        exam_id=exam.id,
                        question_id=q.id,
                        sort_order=idx + 1,
                        marks_override=q.marks,
                    )
                )
            await session.flush()

            # Student 1 Attempt (Completed & Scored)
            att1 = ExamAttempt(
                exam_id=exam.id,
                student_id=users["student1@campusflow.edu"].id,
                status="submitted",
                started_at=now - timedelta(days=1, hours=3),
                submitted_at=now - timedelta(days=1, hours=2),
                total_score=14.0,
                percentage=93.3,
                proctor_violations_count=1,
                proctor_flags=["tab_switch"],
            )
            session.add(att1)
            await session.flush()

            # Proctoring event for Student 1
            session.add(
                ProctoringEvent(
                    attempt_id=att1.id,
                    event_type="tab_switch",
                    severity="low",
                    details={"message": "Student switched browser tabs briefly for 2 seconds."},
                    timestamp=now - timedelta(days=1, hours=2, minutes=40),
                )
            )

            # Student 2 Attempt (Completed & Scored)
            att2 = ExamAttempt(
                exam_id=exam.id,
                student_id=users["student2@campusflow.edu"].id,
                status="submitted",
                started_at=now - timedelta(days=1, hours=2),
                submitted_at=now - timedelta(days=1, hours=1),
                total_score=11.0,
                percentage=73.3,
                proctor_violations_count=0,
                proctor_flags=[],
            )
            session.add(att2)
            await session.flush()

            # Student 3 Attempt (In Progress)
            att3 = ExamAttempt(
                exam_id=exam.id,
                student_id=users["student3@campusflow.edu"].id,
                status="in_progress",
                started_at=now - timedelta(minutes=20),
                proctor_violations_count=0,
                proctor_flags=[],
            )
            session.add(att3)
            await session.flush()

            # Scheduled Final Exam
            final_exam = Exam(
                title="CS201 Final Examination: Advanced Algorithms & Analysis",
                description="Final cumulative examination covering graph theory, dynamic programming, and amortized complexity.",
                course_offering_id=offering_dsa.id,
                created_by_id=users["faculty.cse@campusflow.edu"].id,
                exam_type="final",
                duration_minutes=120,
                total_marks=100.0,
                passing_marks=50.0,
                start_window=now + timedelta(days=5),
                end_window=now + timedelta(days=7),
                config={"proctoring_enabled": True, "max_violations": 4, "shuffle_questions": True},
                status="scheduled",
            )
            session.add(final_exam)

        await session.commit()

    print("[SUCCESS] CampusFlow database successfully seeded with realistic institutional data!")
    print("\nDemo Accounts:")
    print("  * Super Admin:       admin@campusflow.edu       / Admin@CampusFlow2026")
    print("  * Exam Controller:   controller@campusflow.edu  / Password@123")
    print("  * Department Head:   hod.cse@campusflow.edu     / Password@123")
    print("  * Faculty (CSE):     faculty.cse@campusflow.edu / Password@123")
    print("  * Faculty (MECH):    faculty.mech@campusflow.edu / Password@123")
    print("  * Student 1:         student1@campusflow.edu    / Password@123")
    print("  * Student 2:         student2@campusflow.edu    / Password@123")
    print("  * Student 3:         student3@campusflow.edu    / Password@123")
    print("  * Student 4:         student4@campusflow.edu    / Password@123")


if __name__ == "__main__":
    asyncio.run(seed())
