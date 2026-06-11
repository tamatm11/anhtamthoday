# Cấu trúc lưu trữ & quy trình đưa đề thi THPT vào database

## Context (vì sao có kế hoạch này)

Bạn có **hàng trăm file `.docx`** đề thi thử THPT 2026 (Toán/Lý/Hoá/Sinh) trong Google Drive, tổ chức theo folder môn → file = 1 đề của 1 trường/sở. Bạn muốn đưa lên database và hỏi: **nên lưu trữ & cấu trúc hệ thống như thế nào**, và **PaddleOCR có dùng được không**.

Các quyết định bạn đã chốt:
- **Mục tiêu**: gom câu hỏi vào **ngân hàng dùng chung để random** tạo đề mới.
- **Đáp án**: không chắc/không đồng nhất giữa các file → cần bước nhập/soát key.
- **Cách nhập**: đang cân nhắc PaddleOCR.

3 phát hiện then chốt từ khảo sát:
1. **DB đã có sẵn một mô hình chuẩn hoá rất đầy đủ** (ngân hàng câu hỏi + blueprint + đề + pipeline soạn đề + R2 ảnh + tự chấm). Không cần thiết kế lại — chỉ cần đổ dữ liệu vào đúng chỗ và xây lớp nhập liệu.
2. File `.docx` **nhúng công thức và phương án A/B/C/D dạng ẢNH (MathType/OLE), không phải text**. Trích text trực tiếp mất gần như toàn bộ nội dung toán (đã kiểm chứng: bản export text của 1 đề Toán cho ra các phương án trống rỗng `A. . B. . C. .`).
3. Web render công thức bằng **KaTeX** (`$...$`/`$$...$$`) và ảnh qua URL R2. Vậy: **công thức lưu dạng LaTeX**, **hình/đồ thị lưu dạng ảnh R2**.

→ Kết luận chủ đạo: **không lưu `.docx` thô để phục vụ thi**. Đổ vào ngân hàng chuẩn hoá sẵn có, giữ `.docx` chỉ để lưu trữ/đối chiếu.

---

## 1. Nguyên tắc lưu trữ (2 tầng)

| Tầng | Lưu cái gì | Bảng | Mục đích |
|---|---|---|---|
| **Nội dung (tái sử dụng)** | Từng câu hỏi chuẩn hoá + đáp án + ảnh, gắn `knowledge_field` + `difficulty` | `questions` (+ bảng con) | Ngân hàng để **random**, thống kê per-câu, tái dùng |
| **Đề (provenance + phục vụ)** | Đề gốc của từng trường + mã đề + thứ tự câu | `exam_rooms` → `exam_room_papers` → `exam_room_questions` | Thi đúng đề gốc; nguồn gốc; đề random qua `exam_room_generation_rules` |

Điểm hay của schema hiện tại: khi publish một đề (mode `paper`), **mọi câu vẫn được insert vào `questions` (bank dùng chung)** rồi mới gắn vào paper. Nghĩa là nhập đề gốc của từng trường = **đồng thời** làm đầy ngân hàng. Mục tiêu "gom vào ngân hàng để random" đạt được tự nhiên, lại có thêm provenance.

`.docx` gốc: **giữ ở Drive** (đã có) hoặc mirror sang R2 bucket `archive/`; chỉ lưu `drive_file_id` + checksum trong metadata. KHÔNG dùng để serve.

---

## 2. Map dữ liệu vào schema (đã tồn tại, chỉ cần dùng đúng)

Cấu trúc đề THPT 2026 → 3 phần ↔ 3 `question_type` đã có sẵn:

- **Phần I** (trắc nghiệm 4 phương án) → `type=multiple_choice` → `question_options` + `question_correct_options`.
- **Phần II** (Đúng/Sai a,b,c,d) → `type=true_false` → `question_true_false_items` + `question_true_false_answer_keys`.
- **Phần III** (trả lời ngắn) → `type=short_answer` → `question_short_answer_keys`.

Mỗi câu: `questions(content=LaTeX, difficulty 1–4, knowledge_field_id, explanation, source_label, image_url, metadata)`.
- **Công thức** → để trong `content`/`option.content` dạng `$...$` (KaTeX render).
- **Hình/đồ thị/bảng biến thiên/hình học** → ảnh: `r2_assets` (đăng ký) → `question_assets` + `image_url` (đã có ràng buộc HTTPS ổn định, ≤10MB, png/jpeg/webp/avif).
- **Blueprint 2026** theo môn đã seed (`exam_blueprints` + `exam_blueprint_sections` + `score_steps`) — tái dùng, không tạo lại.

---

## 3. PaddleOCR‑VL — chốt dùng làm engine trích xuất

**Phù hợp.** (Đính chính: công cụ `paddleocr.ocr` trong MCP chỉ là OCR text cổ điển — chỉ có `text_det`/`text_rec`, không ra công thức. **PaddleOCR‑VL** là model vision‑language khác hẳn.)

PaddleOCR‑VL **xử lý được đúng phần khó** của bộ đề:
- **Công thức toán → LaTeX** trực tiếp (giải quyết điểm chết của OCR thuần). ✅
- **Chữ tiếng Việt** đa ngôn ngữ. ✅
- **Bảng → HTML/cấu trúc** (bảng số liệu ghép nhóm). ✅
- **Layout + reading order + tách vùng figure** → cho **bounding box** để crop hình tự động. ✅

Vẫn còn 4 việc PaddleOCR‑VL **không tự lo trọn**, cần xử lý thêm trong pipeline:
1. **Hình/đồ thị/bảng biến thiên/hình học** không chuyển thành text được → dùng box layout của VL để **crop → upload R2 → gắn `question_assets`/`image_url`** (giữ dạng ảnh).
2. **Bọc LaTeX vào `$...$`** để KaTeX render (output VL là LaTeX trần).
3. **Đáp án**: parse "HƯỚNG DẪN GIẢI" — Đúng/Sai & "Đáp số:" (Phần II, III) rõ ràng; **Phần I phải suy từ lời giải → đánh dấu cần soát**.
4. **Phân loại** `difficulty` + `knowledge_field` cho từng câu (VL không làm) → LLM gợi ý + người duyệt.

→ **Vẫn giữ bước người soát** trong `/admin/authoring` trước khi publish — nhưng nhờ VL ra LaTeX sẵn, khối lượng sửa tay giảm mạnh, chủ yếu còn xác nhận đáp án + gắn tag + duyệt hình.

---

## 4. Quy trình nhập — phân chia phạm vi rõ ràng

**Ranh giới (theo bạn chốt):**
- **Ngoài app — BẠN xử lý riêng:** `.docx → ảnh → PaddleOCR‑VL → LaTeX` (trích xuất). App không đụng tới docx.
- **Trong app — phần cần xây:** nhận **LaTeX bàn giao** → adapter chuyển sang **DSL soạn đề** → tạo `exam_authoring_documents` → người soát → publish.

```
[BẠN xử lý riêng]                         [APP — phạm vi triển khai]
.docx → ảnh → PaddleOCR‑VL → LaTeX  ──►  [A] Adapter: LaTeX → DSL parser.ts
(chữ VI + công thức + bảng + box)         segment câu, map type/section,
                                          bọc $...$, gắn \image{R2_url}
                                     ──►  [B] Tạo exam_authoring_documents (1 doc/đề)
                                     ──►  [C] Người soát /admin/authoring:
                                          xác nhận đáp án, tag knowledge/difficulty,
                                          đăng ký ảnh R2
                                     ──►  [D] publish_authoring_document (RPC atomic)
                                     ──►  [E] (tuỳ chọn) đề random qua
                                          exam_room_generation_rules
```

**Điểm tái dùng (không viết lại):**
- DSL LaTeX + `parseAuthoringSource` — `src/lib/authoring/parser.ts`
- RPC `publish_authoring_document` (materialize atomic) — migration `20260605100040_authoring_workspace_r2_images.sql`
- Registry ảnh `r2_assets` + ràng buộc — cùng migration trên
- Workspace soát/đăng — `src/app/admin/authoring/page.tsx`, `actions.ts`
- Cây kiến thức `knowledge_fields`

### Hợp đồng bàn giao (đã chốt)

- **Đầu vào**: **JSON đã tách theo câu** (PaddleOCR‑VL của bạn xuất ra).
- **Ảnh figure**: **file local** → app upload R2 + ghi `r2_assets`.

Schema JSON đề xuất (1 file / đề):

```jsonc
{
  "source": { "school": "THPT Mai Anh Tuấn", "province": "Thanh Hóa",
              "year": 2026, "round": 1, "subjectCode": "TOAN",
              "driveFileId": "1X43..." },
  "questions": [
    {
      "part": "I",                 // "I" | "II" | "III"  → suy ra type nếu thiếu
      "no": 1,
      "type": "multiple_choice",   // optional; mặc định theo part
      "difficulty": 2,             // optional, mặc định 2 (người soát chỉnh)
      "knowledgeFieldSlug": null,  // optional
      "content": "Trong không gian ... Toạ độ của $\\vec a$ là",
      "options": [                 // Phần I
        { "label": "A", "content": "$(1;2;3)$", "correct": false }
      ],
      "trueFalseItems": [          // Phần II
        { "label": "a", "content": "...", "correct": true }
      ],
      "answer": "2932",            // Phần III
      "explanation": null,         // optional
      "images": [                  // file local → upload R2
        { "path": "out/de01/q1.png", "alt": "Đồ thị", "target": "question" }
        // target: "question" | "optionA".. để gắn đúng chỗ
      ]
    }
  ]
}
```
Quy ước map `part → type`: I→`multiple_choice`, II→`true_false`, III→`short_answer`.

### Phần cần XÂY MỚI (4 mảnh, gọn)

- **[A] Schema + validate đầu vào** — `src/lib/authoring/importSchema.ts` (zod): kiểu JSON trên, kiểm tra hợp lệ trước khi xử lý.
- **[B] Helper upload R2** (net‑new, **cần credentials R2**) — `src/lib/r2/upload.ts`: đọc file local → put lên bucket R2 → tính `public_url` HTTPS ổn định → insert `r2_assets` (public_url, content_type, size_bytes). Hiện dự án **chưa có** client R2 nào, workspace chỉ validate ảnh có sẵn → cần thêm `@aws-sdk/client-s3` (R2 endpoint) + ENV (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`).
- **[C] Adapter JSON→DSL** — `src/lib/authoring/importAdapter.ts`: map mỗi câu sang DSL parser hiểu (`\begin{question}[type,section,difficulty,knowledge]` + `\begin{choice}[correct]` / `\begin{statement}[correct]` / `\answer{}` / `\explanation{}` / `\image[alt]{R2_url}`), bọc `$...$`. **Tự test round‑trip** qua `parseAuthoringSource` để chắc parse lại 0 lỗi.
- **[D] Import server action** — `src/app/admin/authoring/importActions.ts`: validate JSON → upload ảnh (B) → sinh DSL (C) → tạo `exam_rooms` + `exam_room_papers` cho đề (giữ provenance) → `createAuthoringDocument(mode='paper')` + `save_authoring_document` để nạp DSL → trả `documentId` cho người soát. Publish vẫn dùng RPC sẵn có.

---

## 5. Quy ước mã & metadata nguồn

- **subject code**: dùng đúng code đã seed trong `subjects` (cần xác nhận: TOAN/LY/HOA/SINH hay mã BGD khác).
- **exam_rooms.code**: `<MÔN>-2026-<SLUG_TRƯỜNG>-L<lần>`, vd `TOAN-2026-CHUYEN-BAC-NINH-L1`.
- **paper_code**: `DE-001`, `DE-002`… (mã đề trong 1 phòng).
- **questions.metadata** (jsonb, đã có): `{ source, year:2026, round, school, province, part, drive_file_id }`.
- **questions.source_label**: tên trường/sở để hiển thị & lọc.
- Nguồn gốc nên gom vào **1 bảng nhẹ `exam_sources`** (migration mới, tuỳ chọn) để query/thống kê/chống trùng theo trường — thay vì chỉ rải trong metadata.

---

## 6. Chống trùng ngân hàng (quan trọng cho "random")

Cùng một câu xuất hiện ở nhiều đề của nhiều trường → trùng trong bank → random bị lệch.
- Thêm cột **`content_hash`** trên `questions` (chuẩn hoá content+latex+đáp án rồi hash) để phát hiện trùng (migration mới).
- Chính sách: hoặc **gộp** (1 câu, nhiều nguồn) hoặc **giữ riêng** kèm provenance — quyết định theo nhu cầu thống kê.
- **Cảnh báo công sức**: random công bằng đòi `difficulty` + `knowledge_field` đúng cho **mọi** câu (hàng trăm đề × ~22 câu). Đây là chi phí lớn nhất; nên để LLM gợi ý + người duyệt theo lô tăng dần.

---

## 7. Lộ trình triển khai

1. **Xác nhận nền tảng**: subject codes thật + đã có blueprint 2026 cho cả 4 môn chưa (đã thấy migration `add_missing_bgd_subjects_and_blueprints`, cần verify Lý/Hoá/Sinh).
2. **Pilot 3–5 đề/môn** chạy full pipeline [A]→[D] với **PaddleOCR‑VL**; đo tỉ lệ LaTeX/đáp án đúng & công sức soát; chuẩn hoá cấu hình VL (DPI ảnh, ngưỡng layout, crop figure).
3. **Chuẩn hoá** template trích theo từng môn (Phần I/II/III, bảng đáp án).
4. (Tuỳ chọn) **Migration** `exam_sources` + `questions.content_hash`.
5. **Batch** theo môn; tag knowledge/difficulty tăng dần.
6. (Tuỳ chọn) Bật **đề random** qua `exam_room_generation_rules`.

---

## 8. Kiểm thử (end‑to‑end)

- Sau pilot: vào `/admin/authoring` → mở 1 đề parse ra, soát, **publish**; tạo `exam_key`; gọi `join_exam`; vào `/exam` thi thử; kiểm tra **auto‑chấm khớp đáp án gốc**.
- Kiểm tra **ảnh R2 hiển thị** + **công thức KaTeX render** trên `QuestionRenderer` (desktop + mobile).
- Nếu bật random: sinh 1 đề từ bank, xác nhận đúng cấu trúc blueprint (số câu mỗi phần, thang điểm).
- Chạy gate dự án: `npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test`, `npm run build`.

---

## Đã chốt

- Engine trích xuất: **PaddleOCR‑VL** (bạn xử lý `.docx → LaTeX` ngoài app).
- Cổng nhập: **qua trình soạn đề + `publish_authoring_document`** (importer chỉ sinh DSL, người soát rồi publish).
- Bàn giao: **JSON theo câu** + **ảnh file local → app upload R2**.
- Phạm vi app = 4 mảnh [A]–[D] ở §4.

## Còn cần để bắt đầu code

- **Credentials R2** (bắt buộc cho [B]): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. (Lưu ở `.env.local`, KHÔNG commit.)
- Xác nhận **subject codes thật** trong `subjects` (TOAN/LY/HOA/SINH?) + đã có blueprint 2026 đủ 4 môn.
- Đồng ý 2 migration nhỏ (tuỳ chọn): `exam_sources` + `questions.content_hash`.
- Cách chạy import: **mặc định script Node** (`scripts/import-exam.ts`, service role) vì hợp với hàng trăm đề; có thể bọc trang admin sau. Core [A]–[D] dùng chung.
