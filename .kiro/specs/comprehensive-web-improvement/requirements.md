# Requirements Document

## Introduction

Tài liệu này mô tả yêu cầu cho việc **cải thiện toàn diện** ứng dụng web thi THPT (Web-thi-thpt) và hệ thống soạn đề thi dùng LaTeX. Mục tiêu là nâng cao chất lượng kiến trúc mã nguồn (tái cấu trúc các file lớn bị gộp nhiều chức năng theo hướng OOP/tách lớp rõ ràng), cải thiện trải nghiệm và độ tin cậy của phân hệ soạn đề LaTeX, tối ưu cơ sở dữ liệu Supabase/Postgres, nâng cao hiệu năng và khả năng tiếp cận (accessibility) phía frontend, củng cố độ tin cậy và bảo mật phía backend, đồng thời thiết lập cấu trúc và checklist cho phép mở rộng web trong tương lai.

Ứng dụng hiện dùng Next.js (phiên bản tùy biến 16.2.7 — App Router), React 19, TypeScript, Tailwind/CSS Modules, Supabase (Postgres, Auth, Storage, Realtime), Zustand store, CodeMirror + KaTeX + unified-latex cho phân hệ soạn đề LaTeX, và Vitest cho kiểm thử.

Phạm vi của spec này là **lập kế hoạch và đặc tả yêu cầu** (không viết code trong giai đoạn này). Việc tái cấu trúc phải bảo toàn hành vi hiện có (behavior-preserving) trừ khi một thay đổi hành vi được nêu rõ là yêu cầu.

## Glossary

- **WebApp**: Toàn bộ ứng dụng web thi THPT (Next.js App Router) bao gồm các route admin, auth, exam, profile, register, result, room-key, subjects.
- **AuthoringSubsystem**: Phân hệ soạn đề thi gồm `AuthoringWorkspace`, `LatexEditor`, parser LaTeX (`src/lib/authoring/parser.ts`) và server actions (`src/app/admin/authoring/actions.ts`).
- **LatexParser**: Thành phần phân tích cú pháp nội dung LaTeX thành cấu trúc câu hỏi/đề thi nội bộ (`src/lib/authoring/parser.ts`).
- **LatexPrinter**: Thành phần xuất (pretty-print) cấu trúc câu hỏi/đề thi nội bộ trở lại định dạng LaTeX.
- **DataLayer**: Lớp truy cập dữ liệu Supabase (`src/lib/supabase/`, ví dụ `exam-data.ts`).
- **Database**: Cơ sở dữ liệu Postgres do Supabase quản lý.
- **MergedFile**: File mã nguồn vượt ngưỡng kích thước/độ phức tạp đã định, chứa nhiều trách nhiệm/chức năng cần được tách (ví dụ `src/app/admin/page.tsx`, `AuthoringWorkspace.tsx`, `src/app/exam/page.tsx`, `result/page.tsx`, `profile/page.tsx`, `parser.ts`, `actions.ts`, `exam-data.ts`).
- **Module**: Đơn vị mã nguồn sau tái cấu trúc với một trách nhiệm rõ ràng (class, service, hook, hoặc component được tách riêng).
- **Maintainer**: Lập trình viên phát triển và bảo trì WebApp.
- **Author**: Người dùng admin soạn đề thi bằng LaTeX.
- **ExamTaker**: Thí sinh làm bài thi trên WebApp.
- **ArchitectureChecklist**: Tài liệu checklist liệt kê các hạng mục cải thiện và tiêu chí mở rộng trong tương lai.
- **ImprovementID**: Định danh duy nhất của một hạng mục cải thiện trong ArchitectureChecklist.
- **RLS**: Row Level Security của Postgres/Supabase.
- **Behavior_Preserving**: Thuộc tính khi đầu ra/hành vi quan sát được của hệ thống không thay đổi trước và sau tái cấu trúc với cùng đầu vào.
- **Test_Suite**: Bộ kiểm thử Vitest của dự án.

## Requirements

### Requirement 1: Tái cấu trúc các file bị gộp nhiều chức năng theo hướng OOP

**User Story:** As a Maintainer, I want các file lớn chứa nhiều chức năng được tách thành các module có trách nhiệm rõ ràng theo hướng OOP, so that mã nguồn dễ đọc, dễ kiểm thử và dễ bảo trì.

#### Acceptance Criteria

1. THE WebApp SHALL maintain a documented list of MergedFiles, trong đó MergedFile là bất kỳ file mã nguồn nào vượt quá 400 lines of code (không tính dòng trống và dòng chỉ chứa comment), và danh sách này SHALL được cập nhật mỗi khi một file vượt ngưỡng được thêm vào hoặc một MergedFile được tái cấu trúc xuống dưới ngưỡng.
2. WHEN a MergedFile is refactored, THE Maintainer SHALL split the MergedFile into Modules, trong đó mỗi Module chỉ phơi bày đúng một primary responsibility (một nhóm hàm/lớp phục vụ một mục đích nghiệp vụ hoặc kỹ thuật duy nhất) và không Module nào vượt quá 400 lines of code.
3. WHERE business logic is mixed with UI rendering in a MergedFile, THE Maintainer SHALL separate the business logic into a non-UI Module distinct from the rendering Module, sao cho Module nghiệp vụ không chứa lời gọi render UI và Module render không chứa quy tắc nghiệp vụ.
4. WHEN a MergedFile is refactored, THE refactoring SHALL be Behavior_Preserving, được xác minh bằng việc Test_Suite chạy thành công với cùng observable outputs cho cùng inputs; ràng buộc này chỉ áp dụng cho các file thực sự được tái cấu trúc.
5. IF the Test_Suite fails after a MergedFile is refactored, THEN THE Maintainer SHALL revert the refactoring để khôi phục hành vi trước đó và SHALL không hợp nhất thay đổi cho đến khi Test_Suite chạy thành công với cùng observable outputs cho cùng inputs.
6. THE WebApp SHALL organize refactored DataLayer access for exam data into a dedicated Module separated from UI components, sao cho không component UI nào truy cập trực tiếp dữ liệu đề thi mà không thông qua Module DataLayer.
7. WHERE the same logic xuất hiện trùng lặp ở từ 2 Modules trở lên, THE Maintainer SHALL extract the shared logic into a single reusable Module được tham chiếu bởi tất cả các Module liên quan.

### Requirement 2: Cải thiện phân hệ soạn đề thi LaTeX

**User Story:** As an Author, I want phân hệ soạn đề LaTeX ổn định và phản hồi rõ ràng, so that tôi soạn đề chính xác và phát hiện lỗi sớm.

#### Acceptance Criteria

1. WHEN an Author submits LaTeX content có kích thước từ 1 đến 1.000.000 ký tự và tuân thủ cú pháp đề thi được hỗ trợ, THE LatexParser SHALL parse nội dung thành một cấu trúc câu hỏi trong vòng tối đa 2 giây.
2. IF an Author submits LaTeX content rỗng hoặc vượt quá 1.000.000 ký tự, THEN THE LatexParser SHALL từ chối nội dung và trả về thông báo lỗi cho biết giới hạn kích thước bị vi phạm mà không tạo ra cấu trúc câu hỏi.
3. IF an Author submits LaTeX content sai cú pháp, THEN THE LatexParser SHALL trả về thông báo lỗi mô tả loại lỗi kèm vị trí lỗi theo số dòng và số cột, và SHALL không tạo ra cấu trúc câu hỏi một phần.
4. WHEN một cấu trúc câu hỏi hợp lệ được cung cấp, THE LatexPrinter SHALL format cấu trúc đó thành LaTeX content mà khi được LatexParser phân tích lại sẽ tạo ra cấu trúc câu hỏi tương đương.
5. WHEN một cấu trúc câu hỏi được tạo ra từ việc phân tích LaTeX content hợp lệ, THE AuthoringSubsystem SHALL thỏa mãn thuộc tính khứ hồi (round-trip), trong đó parse rồi print rồi parse tạo ra cấu trúc câu hỏi tương đương, bảo toàn toàn bộ chi tiết định dạng bao gồm khoảng trắng và chú thích; hai cấu trúc được xem là tương đương khi mọi trường nội dung, định dạng, khoảng trắng và chú thích trùng khớp từng ký tự.
6. WHILE an Author đang chỉnh sửa LaTeX content trong LatexEditor, THE AuthoringSubsystem SHALL render bản xem trước của nội dung đã phân tích trong vòng tối đa 1 giây kể từ lần thay đổi nội dung gần nhất.
7. IF LaTeX content trong LatexEditor không thể phân tích được trong khi xem trước, THEN THE AuthoringSubsystem SHALL hiển thị thông báo lỗi nêu vị trí lỗi và SHALL giữ nguyên bản xem trước hợp lệ gần nhất.
8. WHEN an Author lưu một câu hỏi, THE AuthoringSubsystem SHALL lưu câu hỏi thông qua DataLayer và báo cáo kết quả thành công cho Author trong vòng tối đa 5 giây.
9. IF việc lưu qua DataLayer thất bại, THEN THE AuthoringSubsystem SHALL báo cho Author một thông báo lỗi cho biết việc lưu không thành công và SHALL giữ nguyên nội dung đang soạn mà không mất dữ liệu.

### Requirement 3: Tối ưu cơ sở dữ liệu và hiệu năng truy vấn

**User Story:** As a Maintainer, I want các truy vấn dữ liệu được tối ưu và có chỉ mục phù hợp, so that WebApp phản hồi nhanh khi dữ liệu tăng trưởng.

#### Acceptance Criteria

1. THE Database SHALL define an index on every foreign key column used in join or filter operations by the DataLayer.
2. WHERE the DataLayer retrieves a list that can grow without bound, THE DataLayer SHALL apply pagination với page size trong khoảng từ 1 đến 100 và giá trị mặc định là 20.
3. IF the DataLayer nhận một page size nằm ngoài khoảng từ 1 đến 100, THEN THE DataLayer SHALL trả về một lỗi cho biết page size không hợp lệ và SHALL không trả về bản ghi nào.
4. WHEN the DataLayer retrieves related records across tables, THE DataLayer SHALL avoid N+1 query patterns bằng cách batching hoặc joining sao cho tổng số truy vấn không vượt quá 2 truy vấn bất kể số bản ghi liên quan N.
5. THE Database SHALL enforce RLS policies on every table that contains user-owned or role-restricted data, sao cho không có bảng đủ điều kiện nào thiếu RLS policy.
6. WHERE an RLS policy references a function in its predicate, THE policy SHALL wrap the function call để được đánh giá một lần cho mỗi truy vấn thay vì một lần cho mỗi hàng.
7. THE DataLayer SHALL trả về kết quả cho một truy vấn ở page size tối đa (100) với thời gian phản hồi ở phân vị thứ 95 (p95) dưới 500 mili-giây.
8. WHEN database schema hoặc tập index thay đổi, THE WebApp SHALL cập nhật tài liệu schema và index hiện hành trong ArchitectureChecklist.

### Requirement 4: Hiệu năng và khả năng tiếp cận phía frontend

**User Story:** As an ExamTaker, I want giao diện tải nhanh và truy cập được bằng bàn phím và trình đọc màn hình, so that tôi làm bài thuận lợi trên nhiều thiết bị.

#### Acceptance Criteria

1. WHEN một route component phụ thuộc vào một thư viện client-only nặng (kích thước vận chuyển lớn hơn 50KB sau khi nén gzip), THE WebApp SHALL nạp thư viện đó qua một ranh giới deferred hoặc code-split sao cho thư viện không nằm trong initial bundle của route.
2. THE WebApp SHALL cung cấp một accessible name không rỗng cho mọi interactive control hiển thị trên trang, lấy từ visible text label, thuộc tính nhãn liên kết, hoặc thuộc tính accessible label; một control bị coi là FAIL nếu trình đọc màn hình đọc accessible name của nó là rỗng.
3. WHEN một ExamTaker điều hướng WebApp chỉ bằng bàn phím, THE WebApp SHALL hiển thị một focus indicator nhìn thấy được trên control đang được focus, với tỷ lệ tương phản tối thiểu 3:1 so với nền liền kề và không bị che khuất bởi nội dung khác.
4. WHERE non-text content mang ý nghĩa được hiển thị trong các trang làm bài và trang kết quả, THE WebApp SHALL cung cấp một text alternative không rỗng mô tả nội dung đó.
5. WHERE non-text content chỉ mang tính trang trí được hiển thị trong các trang làm bài và trang kết quả, THE WebApp SHALL gán cho nó một text alternative rỗng để trình đọc màn hình bỏ qua.
6. WHILE dữ liệu cho một trang đang được nạp và thời gian nạp vượt quá 300 mili-giây, THE WebApp SHALL hiển thị một loading state cho ExamTaker và ngừng hiển thị loading state đó ngay khi việc nạp dữ liệu hoàn tất hoặc thất bại.
7. IF một client-side data fetch thất bại do lỗi mạng, do quá thời gian chờ 30 giây, hoặc do nhận về phản hồi lỗi từ máy chủ, THEN THE WebApp SHALL hiển thị một error state với tùy chọn thử lại cho ExamTaker đồng thời giữ nguyên dữ liệu và tiến trình làm bài đã có trước đó.
8. WHEN ExamTaker chọn tùy chọn thử lại trên error state, THE WebApp SHALL thực hiện lại data fetch tối đa 3 lần cho mỗi lượt chọn trước khi giữ nguyên error state.

### Requirement 5: Độ tin cậy và bảo mật phía backend

**User Story:** As a Maintainer, I want các server action và truy cập dữ liệu được kiểm soát quyền và xử lý lỗi nhất quán, so that hệ thống an toàn và ổn định.

#### Acceptance Criteria

1. WHEN a server action receives a request, THE WebApp SHALL verify the caller's authentication before performing any data read or write operation associated with that request.
2. IF an unauthenticated caller invokes any server action that requires authentication, THEN THE WebApp SHALL reject the request without performing the operation and return an authorization error result indicating that authentication is required.
3. IF a caller lacking admin privileges invokes an admin-only server action, THEN THE WebApp SHALL reject the request without performing the operation and return an authorization error result indicating that admin privileges are required.
4. WHEN a server action receives input data, THE WebApp SHALL validate every input field against the action's defined schema (including required fields, data type, and allowed value bounds) before using the input.
5. IF input data fails schema validation, THEN THE WebApp SHALL reject the request without performing the operation, leave any existing stored data unchanged, and return a structured validation error result identifying each failing field.
6. IF a server action encounters an error during execution, THEN THE WebApp SHALL roll back any partial changes made within that action, return a structured error result indicating that the operation failed, and record a log entry for the error.
7. THE WebApp SHALL ensure that any error result returned to a caller excludes internal implementation details, stack traces, and secret values.
8. THE WebApp SHALL access the Database using parameterized queries provided by the Supabase client.
9. THE WebApp SHALL exclude service-role credentials and secrets from any client-delivered bundle.

### Requirement 6: Khả năng mở rộng và checklist bảo trì cho tương lai

**User Story:** As a Maintainer, I want một checklist toàn diện và cấu trúc dự án rõ ràng, so that web có thể được mở rộng thêm tính năng trong tương lai mà không phá vỡ kiến trúc.

#### Acceptance Criteria

1. THE WebApp SHALL provide an ArchitectureChecklist trong đó mỗi improvement item có một định danh duy nhất (ImprovementID) và một mô tả, sao cho tập hợp các item bao phủ đủ cả 5 domain: code architecture, LaTeX authoring, database, frontend, và backend.
2. THE ArchitectureChecklist SHALL define a target directory structure trong đó mỗi Module được ánh xạ tới đúng một responsibility domain có tên (code architecture, LaTeX authoring, database, frontend, hoặc backend).
3. WHERE một feature subsystem mới được thêm vào, THE WebApp SHALL đặt subsystem đó trong một directory chuyên biệt khớp với responsibility domain đã được tài liệu hóa trong target directory structure.
4. IF một feature subsystem mới được đặt trong một directory không khớp với responsibility domain đã tài liệu hóa trong target directory structure, THEN THE WebApp SHALL từ chối việc đặt subsystem đó là không hợp lệ (reject as non-conforming), chỉ ra directory dự kiến (expected directory) cho domain tương ứng, và giữ nguyên (preserve) cấu trúc thư mục hiện có mà không thay đổi.
5. THE ArchitectureChecklist SHALL define naming và layering conventions cho Modules, services, và components dưới dạng một tập quy tắc có thể kiểm tra được (checkable rule set), trong đó mỗi quy tắc cho ra kết luận pass/fail xác định khi áp dụng lên một tên hoặc layer cụ thể.
6. WHEN một Maintainer hoàn thành một improvement item, THE ArchitectureChecklist SHALL đặt status của item đó thành "completed" và lưu trữ (persist) giá trị status này để có thể truy xuất lại sau.
7. THE WebApp SHALL document, trong ArchitectureChecklist, các bước được đánh số tuần tự (numbered sequential steps) để thêm một exam subject mới hoặc một question type mới, trong đó mỗi bước chỉ rõ Module hoặc directory bị ảnh hưởng.

### Requirement 7: Bảo toàn hành vi và kiểm thử trong quá trình cải thiện

**User Story:** As a Maintainer, I want mọi thay đổi cải thiện được kiểm chứng bằng kiểm thử, so that quá trình cải thiện không gây hồi quy (regression).

#### Acceptance Criteria

1. WHEN a Module is created or refactored, THE Maintainer SHALL add or update tests in the Test_Suite so that every public function and exported behavior of the Module has at least one corresponding test case asserting its expected output.
2. THE Test_Suite SHALL include a round-trip property test for the LatexParser and LatexPrinter pair that verifies, for at least 100 generated input samples, that printing the parsed output of an input produces a result equal to the original input after normalization.
3. WHEN the build process runs, THE WebApp SHALL complete compilation with zero type errors and zero compilation warnings.
4. IF a refactoring causes one or more tests in the Test_Suite to fail, THEN THE Maintainer SHALL resolve the failures until the Test_Suite reports a 100% pass rate before marking the refactoring complete, and SHALL not commit the refactoring while any test remains failing.
5. WHERE a change is framework-specific to Next.js, THE Maintainer SHALL apply the change in conformance with the local Next.js documentation located in `node_modules/next/dist/docs/`.
6. IF the build process terminates with a non-zero exit status, THEN THE WebApp SHALL be treated as not building successfully and the Maintainer SHALL resolve the build failure before marking the change complete.
