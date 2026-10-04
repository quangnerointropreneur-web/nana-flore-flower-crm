# Kết nối quản trị tài khoản nhân viên

## Cách dùng thông thường — không cần khóa quản trị

Quản lý mở **Nhân viên & tài khoản → Tạo nhân viên / tài khoản**:

- Nhân viên mới: nhập họ tên, tên đăng nhập (ví dụ `lan01`), mật khẩu tối thiểu 6 ký tự, vai trò. Email liên hệ không bắt buộc.
- Tài khoản quản lý mới: dùng email và mật khẩu như hiện tại. Tài khoản email cũ vẫn đăng nhập được, không bị tự động chuyển đổi.
- Sửa họ tên, số điện thoại, email liên hệ của tài khoản tên đăng nhập, vai trò và trạng thái ngay trong web.
- Tạm khóa: bỏ chọn **Đang hoạt động**. Có thể mở khóa lại.
- **Xóa nhân viên khỏi cửa hàng**: thu hồi quyền và ẩn hồ sơ khỏi danh sách. Không xóa vĩnh viễn Firebase Auth user; giữ lịch sử đơn hàng, giao hàng và thanh toán. Phiên đang mở bị chặn bởi Firestore Rules và đăng xuất khi nhận cập nhật quyền.

Tên đăng nhập có 3–32 ký tự không dấu (chữ, số, `.`, `-`, `_`), không phân biệt hoa/thường. Sau khi cấp, tên không đổi hoặc tái sử dụng, kể cả khi nhân viên đã bị thu hồi. Firebase Auth kiểm tra mật khẩu ngầm bằng địa chỉ kỹ thuật ở miền `.invalid`; không cần hộp thư cá nhân, không lưu mật khẩu trong Firestore. Không cần công khai danh sách đăng nhập.

Không thể xóa/khóa chính tài khoản đang sử dụng hoặc thay đổi tài khoản quản lý chính. Không tạo/xóa tài khoản mẫu khi cập nhật.

## Nâng cao — đổi email đăng nhập hoặc đặt lại mật khẩu

Chỉ các thao tác này cần quyền quản trị phía máy chủ. Trong hồ sơ đã cấp đăng nhập, chọn **Đổi email / mật khẩu (nâng cao)**. Email liên hệ của tài khoản tên đăng nhập không thay đổi thông tin đăng nhập. Tài khoản tên đăng nhập không dùng chức năng gửi email khôi phục mật khẩu.

1. Mở https://console.firebase.google.com/project/nananerospace/settings/serviceaccounts/adminsdk.
2. Chọn **Generate new private key**, rồi **Generate key**. File JSON được tải xuống máy.
3. Cấu hình nguyên nội dung JSON thành biến bí mật **FIREBASE_SERVICE_ACCOUNT_JSON** trên hosting của web. Đây là biến phía máy chủ; không dùng tiền tố `VITE_` hoặc `NEXT_PUBLIC_`.
4. Xuất bản lại web để áp dụng biến bí mật. Không đưa file JSON vào GitHub hoặc thư mục public.
5. Firebase → Firestore Database → Rules: dùng nội dung `firestore.rules` trong dự án và bấm Publish. Firestore Rules cấp quyền với dữ liệu cửa hàng; khóa Service Account cấp quyền quản trị Firebase Authentication.

Service Account cần quyền Firebase Authentication Admin và Cloud Datastore User trong đúng dự án nananerospace. Tài khoản Admin SDK mặc định của Firebase thường đã được cấp quyền cần thiết. Nếu xuất hiện thông báo thiếu quyền, kiểm tra tại Google Cloud → IAM.

Để trống mật khẩu mới để giữ mật khẩu hiện tại. Xóa nhân viên trong web luôn là thu hồi quyền, không phải xóa vĩnh viễn danh tính Firebase. Muốn xóa vĩnh viễn cần một quy trình quản trị riêng, không dùng nút này.

Bản cập nhật dọn các bản ghi demo cũ khi quản lý chính mở web lần đầu. Các bản ghi do người dùng tạo mới được giữ. Biểu đồ và thống kê lấy dữ liệu thực, không có số liệu mẫu. Các tài khoản đăng nhập được tạo thật không bị xóa chỉ vì có cùng tên với nhân viên mẫu.
