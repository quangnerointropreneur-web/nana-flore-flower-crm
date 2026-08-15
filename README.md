# Floré — Quản lý tiệm hoa

Ứng dụng quản lý bán hàng dành cho tiệm hoa: khách hàng, dịp đặc biệt, đơn hàng, cắm hoa, giao hàng, thanh toán, hóa đơn và báo cáo.

## Chạy trên máy

Yêu cầu Node.js `>=22.13.0`.

1. Sao chép `.dev.vars.example` thành `.dev.vars`.
2. Đổi `INITIAL_ADMIN_PASSWORD` thành mật khẩu quản trị riêng.
3. Chạy `npm install` rồi `npm run dev`.

Tài khoản quản trị mặc định là `lan@flore.vn`. Mật khẩu không được lưu trong Git; tài khoản chỉ được khởi tạo lần đầu khi cơ sở dữ liệu chưa có tài khoản đăng nhập.

## Kiểm tra bản dựng

- `npm test`: dựng ứng dụng và chạy kiểm tra tự động.
- `npm run lint`: kiểm tra chất lượng mã nguồn.
- `npm run db:generate`: tạo migration sau khi thay đổi cấu trúc dữ liệu.

## Dữ liệu và triển khai

- Dữ liệu nghiệp vụ được lưu trong D1.
- Tệp tải lên dùng R2.
- `.openai/hosting.json` chỉ chứa tên liên kết logic; các giá trị bí mật được cấu hình trong môi trường triển khai.
- Không đưa `.dev.vars`, `.env*`, dữ liệu local hoặc mật khẩu thật lên GitHub.
