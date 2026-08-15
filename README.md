# Floré — Quản lý tiệm hoa

Ứng dụng quản lý bán hàng dành cho tiệm hoa: khách hàng, dịp đặc biệt, đơn hàng, cắm hoa, giao hàng, thanh toán, hóa đơn và báo cáo. Đăng nhập dùng Firebase Authentication; dữ liệu nghiệp vụ được lưu trong Cloud Firestore.

## Chạy trên máy

Yêu cầu Node.js `>=22.13.0`.

1. Chạy `npm install`.
2. Dùng tài khoản quản lý đã tạo trong Firebase Authentication để đăng nhập.
3. Chạy `npm run dev`.

Tài khoản quản trị là `lan@flore.vn`. Mật khẩu không được lưu trong Git. Firestore Security Rules chỉ cấp quyền cho UID quản lý đã cấu hình.

## Kiểm tra bản dựng

- `npm test`: dựng ứng dụng và chạy kiểm tra tự động.
- `npm run lint`: kiểm tra chất lượng mã nguồn.
- `npx firebase-tools deploy --only firestore`: xuất bản Firestore Security Rules.

## Dữ liệu và triển khai

- Dữ liệu nghiệp vụ được lưu theo từng collection trong Cloud Firestore, dưới phạm vi `flore_stores/default`.
- Firebase Web API key chỉ nhận diện dự án; quyền truy cập do Firebase Authentication và Firestore Security Rules kiểm soát.
- Không đưa mật khẩu, service-account key, hoặc thông tin đăng nhập thật lên GitHub.
