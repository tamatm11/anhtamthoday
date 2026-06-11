# Import pilot — KSCL THPT An Dương (Hải Phòng), Toán 2026

Pipeline: PaddleOCR-VL markdown → ngân hàng câu hỏi. Xem kế hoạch tổng quát ở
`KE_HOACH_LUU_TRU_DE_THI.md` (gốc repo). Đề này có **22 câu** (Phần I: 12 trắc
nghiệm, Phần II: 4 đúng/sai, Phần III: 6 trả lời ngắn).

## Cách chạy

```bash
# 1) Tách + tải ảnh + sinh CSV phân mức độ (KHÔNG cần DB/R2)
npx tsx scripts/import-paddle-md.ts extract "<file.md>" [artifacts/import/an-duong-hp]

# 2) (NGOÀI APP) Đưa difficulty.csv + difficulty.prompt.txt qua ChatGPT
#    → ChatGPT điền cột difficulty (1–4) → lưu difficulty.filled.csv vào thư mục này

# 3) Sinh DSL + kiểm chứng round-trip (đọc difficulty.filled.csv nếu có)
npx tsx scripts/import-paddle-md.ts build [artifacts/import/an-duong-hp]
```

## Sản phẩm trong thư mục này

| File | Ý nghĩa |
|---|---|
| `raw/` + `raw-manifest.json` | 26 ảnh BCE đã tải về local (MIME sniff: image/jpeg). |
| `parsed.json` | Cấu trúc trung gian 22 câu (content, options, statements, answer, images, flags). |
| `images.manifest.json` | Map ảnh theo câu → file local; cột `publicUrl` để điền sau khi upload R2. |
| `overrides.json` | Đáp án/nội dung do người soạn chốt (MC keys, verdict II-2, statement II-4, đáp số III-1). **Sửa file này để chỉnh đáp án.** |
| `difficulty.csv` | Bảng phân mức độ (có DRAFT). Đưa qua ChatGPT. |
| `difficulty.prompt.txt` | Lời nhắc cho ChatGPT. |
| `dsl/*.tex` + `dsl/_combined.tex` | DSL từng câu (đã round-trip 0 lỗi với `parseAuthoringSource`). |
| `build-report.json` | Trạng thái round-trip + issue mỗi câu. |

## Đáp án đã chốt (cần người soát xác minh)

- **Phần I (MC):** I-1=C, I-2=C, I-3=B, I-4=C, I-5=C, I-6=B, I-7=D, I-8=B, I-9=B,
  I-10=B, I-11=B, I-12=C *(suy từ lời giải — cần xác minh)*.
- **Phần II (Đ/S):** verdict đọc từ lời giải; II-2 & II-4 lấy từ `overrides.json`.
- **Phần III:** III-1=30 (override), III-2=4,41 · III-3=33,5 · III-4=-25 · III-5=34,1 ·
  III-6=-5 (tự động từ "Đáp số/Đáp án").

## Việc còn lại (blockers)

1. **Phân mức độ:** chạy gate ChatGPT → `difficulty.filled.csv`, rồi `build` lại.
2. **Upload R2 (chưa có creds):** ảnh trong DSL đang trỏ placeholder
   `https://pending-r2.local/...`. Khi có `R2_*` env → xây `src/lib/r2/upload.ts`,
   upload từ `images.manifest.json`, ghi `r2_assets`, thay `publicUrl` vào DSL.
   *(Publish câu có ảnh yêu cầu ảnh đã có trong `r2_assets`.)*
3. **Nạp vào DB để soát:** `.env.local` chưa có service-role key. Cách hiện tại:
   dán DSL từ `dsl/*.tex` vào `/admin/authoring` (mode "Từng câu") để tạo bản nháp,
   soát đáp án + mức độ + ảnh, rồi **Xuất bản** (RPC `publish_authoring_document`).
   *(Có thể tự động hoá bằng script service-role sau.)*

## Lưu ý chất lượng

OCR còn lỗi chính tả (vd "đáy"→"đấy", "vuông"→"vương", "cô sin"→"côn sân"). DSL giữ
nguyên để người soát sửa trong trình soạn. Đáp án MC là **suy luận**, bắt buộc xác minh.
