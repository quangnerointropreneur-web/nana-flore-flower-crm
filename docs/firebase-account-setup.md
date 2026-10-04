# Kết nối quản trị tài khoản nhân viên

Web đã có chức năng tạo nhân viên với email và mật khẩu. Việc đổi email, đặt mật khẩu mới và xóa tài khoản Firebase của người khác cần quyền quản trị phía máy chủ.

1. Mở https://console.firebase.google.com/project/nananerospace/settings/serviceaccounts/adminsdk.
2. Chọn **Generate new private key**, rồi **Generate key**. File JSON được tải xuống máy.
3. Cấu hình nguyên nội dung JSON thành biến bí mật **FIREBASE_SERVICE_ACCOUNT_JSON** trên hosting của web. Đây là biến phía máy chủ; không dùng tiền tố `VITE_` hoặc `NEXT_PUBLIC_`.
4. Xuất bản lại web để áp dụng biến bí mật. Không đưa file JSON vào GitHub hoặc thư mục public.
5. Firebase → Firestore Database → Rules: dùng nội dung `firestore.rules` trong dự án và bấm Publish. Firestore Rules cấp quyền với dữ liệu cửa hàng; khóa Service Account cấp quyền quản trị Firebase Authentication.

Service Account cần quyền Firebase Authentication Admin và Cloud Datastore User trong đúng dự án nananerospace. Tài khoản Admin SDK mặc định của Firebase thường đã được cấp quyền cần thiết. Nếu xuất hiện thông báo thiếu quyền, kiểm tra tại Google Cloud → IAM.

Trong web, đăng nhập bằng tài khoản quản lý → Nhân viên & tài khoản → Tạo nhân viên / tài khoản. Nhập tên, email, mật khẩu, vai trò rồi lưu. Với tài khoản có sẵn, mở Chỉnh sửa tài khoản để đổi thông tin hoặc đặt mật khẩu mới; để trống mật khẩu để giữ nguyên.

Tạm khóa ngăn nhân viên truy cập dữ liệu cửa hàng ngay qua Firestore Rules. Xóa tài khoản sẽ thu hồi quyền truy cập và xóa Firebase Auth user khi kết nối quản trị đã được cấu hình; đơn hàng cũ vẫn được giữ lại. Không thể tự xóa/khóa tài khoản đang sử dụng hoặc xóa tài khoản quản lý chính.

Bản cập nhật dọn các bản ghi demo cũ khi quản lý chính mở web lần đầu. Các bản ghi do người dùng tạo mới được giữ. Biểu đồ và thống kê lấy dữ liệu thực, không có số liệu mẫu. Các tài khoản đăng nhập được tạo thật không bị xóa chỉ vì có cùng tên với nhân viên mẫu.
