# BILLING API ENDPOINTS PLACEHOLDER

Thư mục này được quy hoạch để chứa các API Endpoints cho tính năng Ví Xu và tích hợp nạp tiền MoMo/PayOS của dự án CAPCAT/Doca Pet.

---

## Quy hoạch các Endpoints dự kiến:

1.  **`packages.ts` (API: `GET /api/billing/packages`)**
    *   Trả về danh sách các gói nạp xu có sẵn (ví dụ: 10,000đ = 100 Xu).

2.  **`recharge.ts` (API: `POST /api/billing/recharge`)**
    *   Nhận yêu cầu nạp tiền từ Client, tạo Order trong DB, gọi API của MoMo/PayOS để lấy link thanh toán và trả về cho Client.

3.  **`webhook/momo.ts` (API: `POST /api/billing/webhook/momo`)**
    *   Cổng nhận Webhook từ MoMo. Xác thực chữ ký số, kiểm tra Idempotency và hoàn tất đơn hàng, cộng xu cho người dùng.

4.  **`webhook/payos.ts` (API: `POST /api/billing/webhook/payos`)**
    *   Cổng nhận Webhook dự phòng/thử nghiệm từ PayOS.

5.  **`wallet.ts` (API: `GET /api/billing/wallet`)**
    *   Lấy số dư hiện tại và danh sách lịch sử biến động số dư xu của người dùng hiện tại (yêu cầu xác thực Session/Cookie).

---

*Tham khảo chi tiết thiết kế hệ thống và sơ đồ dữ liệu tại file tài liệu: [docs/features/coin_system/BRIEF.md](file:///Users/ricyuan/CAPCAT/docs/features/coin_system/BRIEF.md)*
