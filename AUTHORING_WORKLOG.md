# Bao cao trien khai chuc nang soan de

Cap nhat ngay: 05/06/2026

## 1. Muc tieu

Dang cai tien khu vuc soan de de:

- Sua loi trong qua trinh nhap va xem truoc cau hoi LaTeX.
- Lam con tro soan thao noi bat, de theo doi vi tri dang nhap.
- Phan loai tung cau hoi theo mon hoc, muc do va pham vi kien thuc.
- Cung cap danh sach tha xuong de chon muc do va pham vi kien thuc.
- Cho phep them nhanh pham vi kien thuc moi khi danh sach chua co.
- Luu pham vi kien thuc cua cau hoi truc tiep vao Supabase Database khi xuat ban.

## 2. Phan da hoan thanh

### Trinh soan thao LaTeX

- Tang do tuong phan cua con tro CodeMirror.
- Con tro co mau vang, rong 3 px va khong dung hieu ung nhap nhay kho theo doi.
- Lam noi bat dong dang soan va so dong hien tai.
- Them vien focus mau xanh khi trinh soan thao dang duoc chon.
- Ho tro di chuyen den dung dong, cot khi bam vao loi phan tich.
- Theo doi vi tri con tro de xac dinh cau hoi dang duoc soan.

### Metadata cua cau hoi

- Bo sung thuoc tinh `knowledgeFieldSlug` cho moi cau hoi.
- LaTeX cua mot cau hoi co the luu metadata theo dang:

```latex
\begin{question}[type=multiple_choice,difficulty=2,knowledge=dai-so]
...
\end{question}
```

- Thanh metadata moi hien thi:
  - Cau hoi hien tai.
  - Mon hoc cua tai lieu.
  - Muc do cau hoi.
  - Pham vi kien thuc.
  - Nut `Them kien thuc`.
- Khi doi muc do hoac pham vi kien thuc, metadata cua dung cau hoi tai vi tri con tro duoc cap nhat trong ma LaTeX.

### Them pham vi kien thuc

- Them hop thoai tao pham vi kien thuc moi.
- Cho phep nhap:
  - Ten kien thuc.
  - Khoi lop.
  - Kien thuc cha.
- Tao slug tu dong, co xu ly ky tu tieng Viet.
- Kiem tra kien thuc cha phai thuoc cung mon hoc.
- Goi Server Action de ghi truc tiep vao bang `knowledge_fields`.
- Sau khi tao thanh cong, kien thuc moi duoc gan ngay cho cau hoi dang soan.

### Luu vao Database

- Tai du lieu `knowledge_fields` theo mon de hien thi trong giao dien.
- Khi xuat ban, he thong:
  1. Luu tai lieu va tao cac ban ghi cau hoi.
  2. Doc `knowledgeFieldSlug` cua tung cau hoi.
  3. Tim `knowledge_fields.id` cung mon hoc.
  4. Cap nhat `questions.knowledge_field_id`.
- Neu slug khong ton tai hoac khong thuoc mon cua tai lieu, giao dich bi huy de tranh luu du lieu sai.

## 3. Migration Supabase

Migration moi:

```text
supabase/migrations/20260605141543_add_authoring_knowledge_metadata.sql
```

Migration thuc hien:

- Doi ham xuat ban cu thanh `publish_authoring_document_core`.
- Tao wrapper `publish_authoring_document`.
- Goi logic xuat ban hien co.
- Anh xa tung cau hoi voi `knowledge_fields` bang slug va mon hoc.
- Cap nhat `questions.knowledge_field_id` trong cung giao dich.
- Bao loi `KNOWLEDGE_FIELD_NOT_FOUND` neu metadata kien thuc khong hop le.

Migration nay da duoc ap dung thanh cong len Supabase project `web-thi-thpt`.

## 4. Cac file chinh da thay doi

```text
src/app/admin/authoring/actions.ts
src/app/admin/authoring/AuthoringWorkspace.tsx
src/app/admin/authoring/LatexEditor.tsx
src/lib/authoring/parser.ts
src/lib/authoring/parser.test.ts
src/lib/authoring/types.ts
src/styles/authoring.module.css
supabase/migrations/20260605141543_add_authoring_knowledge_metadata.sql
```

### Vai tro cua tung file

- `actions.ts`: tai danh muc kien thuc, tao kien thuc moi va xu ly loi Database.
- `AuthoringWorkspace.tsx`: thanh metadata, dropdown, hop thoai them kien thuc va dong bo voi cau hoi hien tai.
- `LatexEditor.tsx`: giao dien con tro, dong hien tai, theo doi vi tri va dieu huong den loi.
- `parser.ts`: doc va cap nhat metadata cua cau hoi theo vi tri con tro.
- `parser.test.ts`: kiem thu viec doc va cap nhat metadata.
- `types.ts`: kieu du lieu cho cau hoi va pham vi kien thuc.
- `authoring.module.css`: bo cuc hai hang va giao dien metadata.

## 5. Kiem thu da chay

Da chay thanh cong:

```text
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test
npm run build
git diff --check
```

Ket qua:

- TypeScript: dat.
- ESLint: dat, khong co warning.
- Vitest: 5 test dat.
- Next.js production build: dat.
- Kiem tra khoang trang trong diff: dat.

## 6. Cong viec con lai

- Xac minh truc quan tren trinh duyet cho man hinh desktop va mobile.
- Thu thao tac doi muc do khi con tro nam trong tung cau hoi.
- Thu mo hop thoai them kien thuc va cac trang thai rong/loi.
- Thu mot luot xuat ban day du voi kien thuc hop le.
- Kiem tra lai quyen goi ham core cua quy trinh xuat ban; nen an ham core khoi API public va chi de wrapper duoc goi truc tiep.

## 7. Luu y ve working tree

Repository dang co nhieu thay doi va file chua duoc commit tu cac cong viec khac. Qua trinh nay khong hoan tac cac thay doi ngoai pham vi chuc nang soan de.
