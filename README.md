# Thầy Phán

Ông thầy ngồi quán trà, phán giùm một câu cho người ngại quyết định. Không giải thích, sai thầy chịu.

## Chạy thử trên máy

Cần Node 20 trở lên.

```bash
npm install
cp .env.example .env   # rồi điền ANTHROPIC_API_KEY
node --env-file=.env server.js
```

Mở http://localhost:3000.

Chưa có khoá Claude thì trang vẫn chạy, thầy rút quẻ từ kho câu có sẵn trong `public/js/rules.js`.

## Cấu trúc

| File | Việc |
|---|---|
| `server.js` | Chạy trên máy, Railway hoặc Render: phục vụ trang và API `/api/phan`. |
| `api/phan.js`, `vercel.json` | Chạy trên Vercel: trang lấy từ `public/`, API là một hàm serverless. |
| `lib/phan.js` | Xử lý `/api/phan` và các chốt chặn chi phí. Dùng chung cho cả hai cách chạy. |
| `lib/claude.js` | Lời dặn cho thầy và lệnh gọi Claude. |
| `lib/store.js` | Bộ đếm và câu phán đã nhớ: Redis (Upstash) nếu có, không thì lưu trong bộ nhớ. |
| `public/js/rules.js` | Kho câu phán, phân loại câu hỏi, các câu thầy không phán bừa (y tế, pháp luật, tiền lớn, bạo lực, khủng hoảng). |
| `public/js/app.js` | Luồng hỏi và phán, animation, thẻ chia sẻ. |
| `test/` | `npm test`. |

## Chi phí và các chốt chặn

Mặc định dùng `claude-opus-5-5`, effort `low`, mỗi lần phán khoảng nửa xu Mỹ. Đặt `THAYPHAN_MODEL=claude-haiku-5-5` thì rẻ hơn khoảng 40 lần; nên thử giọng thầy trước khi đổi.

Server chỉ gọi Claude khi qua hết các chốt sau. Không qua chốt nào thì thầy rút quẻ trong kho, người dùng không thấy lỗi.

| Chốt | Biến | Mặc định |
|---|---|---|
| Lượt hỏi mỗi phút mỗi IP | `RATE_PER_MIN` | 15 |
| Câu nhạy cảm trả câu có sẵn | (luôn bật) | |
| Lượt AI cho mỗi câu hỏi, tính cả hỏi lại | `AI_PER_QUESTION` | 2 |
| Câu phán nhớ cho mỗi câu hỏi; nhớ đủ thì xoay vòng | `CACHE_SIZE` | 5 (nhớ 7 ngày) |
| Lượt AI mỗi ngày cho cả trang | `DAILY_AI_LIMIT` | 2000 |

Với mặc định trên, Opus tốn tối đa khoảng $10/ngày, Haiku khoảng $0,25/ngày.

Chốt cuối cùng nên đặt thêm: giới hạn chi tiêu theo tháng trong Anthropic Console (Settings → Limits).

## Đưa lên Vercel

1. Đưa thư mục `web/` lên GitHub, vào Vercel chọn Import, Root Directory là `web`.
2. Vào Storage (hoặc Marketplace) của dự án, gắn **Upstash Redis**. Vercel tự điền biến kết nối. Thiếu Redis thì các giới hạn chỉ tính riêng từng lần chạy hàm, gần như vô dụng.
3. Settings → Environment Variables: thêm `ANTHROPIC_API_KEY` và các biến chốt chặn nếu muốn đổi mặc định.
4. Deploy. Trang tĩnh nằm trên CDN, API chạy ở vùng mặc định của Vercel (Mỹ), gần máy chủ Claude.

Muốn chạy y nguyên `server.js` thì dùng Railway hoặc Render: lệnh chạy `npm start`, thêm các biến môi trường như trên. Chạy một máy thì không cần Redis.

## Trước khi đưa lên mạng

- Kiểm tra lại số đường dây nóng trong `HOTLINE` (`public/js/rules.js`).
- Chạy sau proxy khác Vercel thì đặt `TRUST_PROXY=1` và để proxy ghi đè header `x-forwarded-for`.
