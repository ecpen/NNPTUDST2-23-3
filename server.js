const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = 3000;

// Khởi tạo SQLite database
const db = new Database("users.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    must_change_password INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
  })
);

// Middleware kiểm tra đăng nhập
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ========== ROUTES ==========

// Trang chủ
app.get("/", requireLogin, (req, res) => {
  // Nếu cần đổi mật khẩu -> redirect
  if (req.session.user.must_change_password) {
    return res.redirect("/change-password");
  }
  res.render("dashboard", { user: req.session.user });
});

// Trang đăng nhập
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render("login", {
      error: "Sai tên đăng nhập hoặc mật khẩu!",
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    must_change_password: user.must_change_password,
  };

  // Nếu lần đầu đăng nhập -> bắt buộc đổi mật khẩu
  if (user.must_change_password) {
    return res.redirect("/change-password");
  }
  res.redirect("/");
});

// Trang đổi mật khẩu (bắt buộc lần đầu)
app.get("/change-password", requireLogin, (req, res) => {
  res.render("change-password", {
    user: req.session.user,
    error: null,
    success: null,
  });
});

app.post("/change-password", requireLogin, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(req.session.user.id);

  // Kiểm tra mật khẩu hiện tại
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.render("change-password", {
      user: req.session.user,
      error: "Mật khẩu hiện tại không đúng!",
      success: null,
    });
  }

  // Kiểm tra mật khẩu mới
  if (newPassword.length < 6) {
    return res.render("change-password", {
      user: req.session.user,
      error: "Mật khẩu mới phải ít nhất 6 ký tự!",
      success: null,
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render("change-password", {
      user: req.session.user,
      error: "Xác nhận mật khẩu không khớp!",
      success: null,
    });
  }

  // Cập nhật mật khẩu
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare(
    "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?"
  ).run(hashed, user.id);

  req.session.user.must_change_password = 0;
  res.render("change-password", {
    user: req.session.user,
    error: null,
    success: "Đổi mật khẩu thành công! Bạn có thể sử dụng hệ thống.",
  });
});

// Đăng xuất
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Trang admin - xem danh sách users
app.get("/admin/users", (req, res) => {
  const users = db
    .prepare(
      "SELECT id, username, email, must_change_password, created_at FROM users"
    )
    .all();
  res.render("admin-users", { users });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  console.log(`Trang đăng nhập: http://localhost:${PORT}/login`);
  console.log(`Quản lý users: http://localhost:${PORT}/admin/users`);
});
