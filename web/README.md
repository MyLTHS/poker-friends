# web — Frontend (Next.js)

Claude dựng ở đợt C2 theo [docs/roadmap.md](../docs/roadmap.md), Codex review. Hiện mới có type
TypeScript sinh từ hợp đồng API.

## Type sinh từ hợp đồng API

`src/api/protocol.ts` (WebSocket, từ `docs/api/schema/`) và `src/api/rest.ts` (REST, từ
`docs/api/openapi.yaml`) là **file sinh tự động, không sửa tay**. Đổi hợp đồng trong `docs/api/`
rồi chạy lại:

```bash
cd web
npm ci              # cài vào web/node_modules, không cài gì toàn cục
npm run api:gen     # sinh lại src/api/*.ts
npm run api:check   # CI chạy lệnh này: báo lỗi nếu type lệch schema hoặc fixture không khớp type
```
