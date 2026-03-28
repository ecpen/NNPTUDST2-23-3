const XLSX = require("xlsx");

// Tạo dữ liệu users
const data = [["username", "email"]];
for (let i = 1; i <= 99; i++) {
  const num = i.toString().padStart(2, "0");
  data.push([`user${num}`, `user${num}@haha.com`]);
}

// Tạo workbook và worksheet
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

// Ghi file
XLSX.writeFile(wb, "user.xlsx");
console.log("Đã tạo file user.xlsx với 99 users");
