import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { 
  adminLoginSchema, 
  studentLoginSchema, 
  insertCourseSchema,
  insertQuestionSchema,
  insertStudentSchema,
  insertTestAttemptSchema,
  insertTestAnswerSchema
} from "@shared/schema";
import { ZodError } from "zod";

declare module "express-session" {
  interface SessionData {
    adminId?: string;
    studentId?: string;
    userType?: "admin" | "student";
  }
}

// Session configuration for production and development
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const isProduction = process.env.NODE_ENV === "production";
  
  if (!process.env.SESSION_SECRET && isProduction) {
    throw new Error("🚨 SESSION_SECRET must be set in production!");
  }
  
  if (!process.env.SESSION_SECRET) {
    console.warn("⚠️  SESSION_SECRET not set! Using default (insecure for development only)");
  }
  
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true, // Allow creation in production
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  return session({
    secret: process.env.SESSION_SECRET || "fallback-dev-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: "cs-examtest-session",
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax", // Use "none" for cross-domain in production
      maxAge: sessionTtl,
    },
  });
}

// Middleware
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.session.adminId || req.session.userType !== "admin") {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  next();
};

const requireStudent = (req: any, res: any, next: any) => {
  if (!req.session.studentId || req.session.userType !== "student") {
    return res.status(401).json({ message: "Student authentication required" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Admin Authentication Routes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { adminId, password } = adminLoginSchema.parse(req.body);
      const admin = await storage.authenticateAdmin(adminId, password);
      
      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.adminId = admin.adminId;
      req.session.userType = "admin";
      res.json({ success: true, admin: { id: admin.id, adminId: admin.adminId, firstName: admin.firstName, lastName: admin.lastName } });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/admin/me", requireAdmin, async (req, res) => {
    try {
      const admin = await storage.getAdminByAdminId(req.session.adminId!);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }
      res.json({ id: admin.id, adminId: admin.adminId, firstName: admin.firstName, lastName: admin.lastName });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Student Authentication Routes
  app.post("/api/student/register", async (req, res) => {
    try {
      const studentData = insertStudentSchema.parse(req.body);
      
      // Check if student already exists
      const existingStudent = await storage.getStudentByEmail(studentData.email);
      if (existingStudent) {
        return res.status(400).json({ message: "Student with this email already exists" });
      }

      const existingStudentId = await storage.getStudentByStudentId(studentData.studentId);
      if (existingStudentId) {
        return res.status(400).json({ message: "Student ID already exists" });
      }

      const student = await storage.createStudent(studentData);
      req.session.studentId = student.id;
      req.session.userType = "student";
      
      res.json({ 
        success: true, 
        student: { 
          id: student.id, 
          studentId: student.studentId, 
          firstName: student.firstName, 
          lastName: student.lastName,
          email: student.email
        } 
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/student/login", async (req, res) => {
    try {
      const { email, password } = studentLoginSchema.parse(req.body);
      const student = await storage.authenticateStudent(email, password);
      
      if (!student) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.studentId = student.id;
      req.session.userType = "student";
      res.json({ 
        success: true, 
        student: { 
          id: student.id, 
          studentId: student.studentId, 
          firstName: student.firstName, 
          lastName: student.lastName,
          email: student.email
        } 
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/student/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/student/me", requireStudent, async (req, res) => {
    try {
      const student = await storage.getStudentById(req.session.studentId!);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.json({ 
        id: student.id, 
        studentId: student.studentId, 
        firstName: student.firstName, 
        lastName: student.lastName,
        email: student.email
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin Routes
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/recent-activity", requireAdmin, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity();
      res.json(activity);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/student-results", requireAdmin, async (req, res) => {
    try {
      const results = await storage.getAllStudentResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Course Routes
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await storage.getAllCourses();
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/courses", requireAdmin, async (req, res) => {
    try {
      const courseData = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(courseData);
      res.json(course);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  // Question Routes
  app.get("/api/admin/questions", requireAdmin, async (req, res) => {
    try {
      const questions = await storage.getAllQuestions();
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/questions/:courseId", requireStudent, async (req, res) => {
    try {
      const questions = await storage.getQuestionsByCourse(req.params.courseId);
      // Remove correct answers for students
      const questionsForStudents = questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
      }));
      res.json(questionsForStudents);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/questions", requireAdmin, async (req, res) => {
    try {
      const questionData = insertQuestionSchema.parse(req.body);
      const question = await storage.createQuestion(questionData);
      res.json(question);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    try {
      const updates = insertQuestionSchema.partial().parse(req.body);
      const question = await storage.updateQuestion(req.params.id, updates);
      res.json(question);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Test Routes
  app.post("/api/student/test/start", requireStudent, async (req, res) => {
    try {
      const testData = insertTestAttemptSchema.parse({
        ...req.body,
        studentId: req.session.studentId,
      });
      const testAttempt = await storage.createTestAttempt(testData);
      res.json(testAttempt);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/student/test/answer", requireStudent, async (req, res) => {
    try {
      const answerData = insertTestAnswerSchema.parse(req.body);
      const answer = await storage.saveTestAnswer(answerData);
      res.json(answer);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/student/test/complete", requireStudent, async (req, res) => {
    try {
      const { testAttemptId, score, correctAnswers, totalQuestions, timeSpent } = req.body;
      const testAttempt = await storage.updateTestAttempt(testAttemptId, {
        completedAt: new Date(),
        score: score,
        correctAnswers,
        totalQuestions,
        timeSpent,
        isCompleted: true,
      });
      res.json(testAttempt);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/student/test/history", requireStudent, async (req, res) => {
    try {
      const history = await storage.getStudentTestHistory(req.session.studentId!);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/student/test/results/:testAttemptId", requireStudent, async (req, res) => {
    try {
      const testAttempt = await storage.getTestAttempt(req.params.testAttemptId);
      if (!testAttempt || testAttempt.studentId !== req.session.studentId) {
        return res.status(404).json({ message: "Test not found" });
      }
      
      const answers = await storage.getTestAnswers(req.params.testAttemptId);
      res.json({ testAttempt, answers });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
