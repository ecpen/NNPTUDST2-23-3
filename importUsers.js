const XLSX = require("xlsx");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
require("dotenv").config();

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

// Đọc file Excel
function readUsersFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  return data; // [{username: 'user01', email: 'user01@haha.com'}, ...]
}

// Tạo password ngẫu nhiên 16 ký tự
function generatePassword(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

// Cấu hình Mailtrap transporter
function createTransporter() {
  const config = {
    host: process.env.MAILTRAP_HOST,
    port: parseInt(process.env.MAILTRAP_PORT),
    tls: { rejectUnauthorized: false },
  };
  // Chỉ thêm auth nếu có user/pass (Docker local không cần)
  if (process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS) {
    config.auth = {
      user: process.env.MAILTRAP_USER,
      pass: process.env.MAILTRAP_PASS,
    };
  }
  return nodemailer.createTransport(config);
}

// Gửi email password cho user
async function sendPasswordEmail(transporter, user, password) {
  const mailOptions = {
    from: process.env.MAIL_FROM || "admin@example.com",
    to: user.email,
    subject: "Thông tin tài khoản của bạn",
    html: `
      <h2>Chào ${user.username},</h2>
      <p>Tài khoản của bạn đã được tạo thành công.</p>
      <p><strong>Username:</strong> ${user.username}</p>
      <p><strong>Password:</strong> ${password}</p>
      <p>Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu.</p>
      <br/>
      <p>Trân trọng,</p>
      <p>Admin</p>
    `,
  };

  return transporter.sendMail(mailOptions);
}

// Main function
async function main() {
  console.log("=== Import Users & Send Password Emails ===\n");

  // 1. Đọc users từ file Excel
  const users = readUsersFromExcel("user.xlsx");
  console.log(`Đã đọc ${users.length} users từ file user.xlsx\n`);

  // 2. Tạo transporter
  const transporter = createTransporter();

  // 3. Verify kết nối SMTP
  try {
    await transporter.verify();
    console.log("Kết nối Mailtrap SMTP thành công!\n");
  } catch (error) {
    console.error("Lỗi kết nối Mailtrap:", error.message);
    console.error(
      "Vui lòng kiểm tra thông tin MAILTRAP_USER và MAILTRAP_PASS trong file .env"
    );
    return;
  }

  // 4. Import users vào database và gửi email
  const insertStmt = db.prepare(
    "INSERT OR REPLACE INTO users (username, email, password, must_change_password) VALUES (?, ?, ?, 1)"
  );
  const results = [];
  for (const user of users) {
    const password = generatePassword(16);
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
      // Lưu user vào database (password được hash)
      insertStmt.run(user.username, user.email, hashedPassword);
      // Gửi email chứa password gốc (chưa hash)
      await sendPasswordEmail(transporter, user, password);
      console.log(`✓ ${user.username} - Đã lưu DB & gửi email`);
      results.push({
        username: user.username,
        email: user.email,
        password: password,
        status: "sent",
      });
    } catch (error) {
      console.error(
        `✗ Lỗi ${user.username}: ${error.message}`
      );
      results.push({
        username: user.username,
        email: user.email,
        password: password,
        status: "failed",
      });
    }
  }

  // 5. Xuất kết quả ra file
  const wsData = [["username", "email", "password", "status"]];
  for (const r of results) {
    wsData.push([r.username, r.email, r.password, r.status]);
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  XLSX.writeFile(wb, "import_results.xlsx");

  // Thống kê
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`\n=== Kết quả ===`);
  console.log(`Tổng: ${results.length} | Thành công: ${sent} | Thất bại: ${failed}`);
  console.log(`Kết quả đã lưu vào file import_results.xlsx`);
  console.log(`\nUsers đã được lưu vào database users.db`);
  console.log(`Chạy "node server.js" để khởi động web đăng nhập tại http://localhost:3000`);

  db.close();
}

main();
