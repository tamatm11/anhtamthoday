# Requirements Document

## Introduction

Tính năng "Bảng tra công thức soạn đề" (Formula Reference) bổ sung một bảng tham khảo các công thức và ký hiệu toán học (biểu thức LaTeX/KaTeX) cùng cú pháp soạn đề đặc thù của hệ thống, hiển thị ngay trong giao diện soạn đề (`/admin/authoring`). Mục tiêu là giúp người soạn đề tra cứu nhanh cú pháp công thức hợp lệ, xem trước kết quả hiển thị, và chèn nhanh biểu thức vào trình soạn thảo LaTeX tại vị trí con trỏ mà không cần ghi nhớ thủ công.

Bảng tra cứu hoạt động hoàn toàn ở phía client, không thay đổi luồng autosave/xuất bản hiện có, và tận dụng bộ render KaTeX cùng cơ chế chèn văn bản (`insertText`) đã có sẵn của trình soạn thảo.

## Glossary

- **Authoring_Workspace**: Màn hình soạn đề tại `/admin/authoring`, được hiện thực bởi component `AuthoringWorkspace`.
- **Latex_Editor**: Trình soạn thảo LaTeX dựa trên CodeMirror (`LatexEditor`), cung cấp lệnh `insertText` để chèn văn bản tại vị trí con trỏ.
- **Formula_Reference**: Thành phần giao diện mới hiển thị bảng tra cứu các công thức và cú pháp soạn đề có thể sử dụng.
- **Reference_Entry**: Một mục trong bảng tra cứu, gồm tên/mô tả, đoạn mã LaTeX nguồn, và phần xem trước kết quả render.
- **Reference_Category**: Nhóm phân loại các Reference_Entry (ví dụ: phân số, lũy thừa, căn thức, tích phân, ma trận, cú pháp soạn đề).
- **Katex_Renderer**: Bộ render công thức KaTeX đã dùng trong hệ thống (`MathText`/`QuestionRenderer`) để hiển thị bản xem trước.
- **Author**: Người dùng có quyền truy cập màn hình soạn đề và đang soạn nội dung.
- **Published_State**: Trạng thái khi tài liệu đang chọn đã được xuất bản và trình soạn thảo ở chế độ chỉ đọc (`publishedCurrent`).

## Requirements

### Requirement 1: Hiển thị bảng tra công thức trong màn hình soạn đề

**User Story:** Là một người soạn đề, tôi muốn mở một bảng tra cứu các công thức có thể dùng ngay trong màn hình soạn đề, để tôi biết được các cú pháp hợp lệ mà không cần rời khỏi trình soạn thảo.

#### Acceptance Criteria

1. THE Authoring_Workspace SHALL hiển thị thường trực một điều khiển (nút) để mở Formula_Reference trong khu vực thanh công cụ soạn thảo.
2. WHEN màn hình soạn đề tải xong, THE Authoring_Workspace SHALL để Formula_Reference ở trạng thái ẩn theo mặc định.
3. WHEN Author kích hoạt điều khiển mở Formula_Reference, THE Authoring_Workspace SHALL hiển thị Formula_Reference trong vòng tối đa 1 giây, chứa danh sách Reference_Entry với mỗi Reference_Category có một tiêu đề nhóm quan sát được.
4. WHILE Formula_Reference đang hiển thị, THE Authoring_Workspace SHALL giữ nguyên nội dung văn bản, vị trí con trỏ, và trạng thái chỉ đọc/chỉnh sửa của Latex_Editor.
5. WHEN Author kích hoạt điều khiển đóng Formula_Reference, THE Authoring_Workspace SHALL ẩn Formula_Reference đồng thời giữ nguyên nội dung văn bản và vị trí con trỏ của Latex_Editor.

### Requirement 2: Nội dung tra cứu công thức và cú pháp

**User Story:** Là một người soạn đề, tôi muốn xem danh sách các công thức toán học và cú pháp soạn đề kèm mô tả, để tôi chọn đúng biểu thức cần dùng.

#### Acceptance Criteria

1. THE Formula_Reference SHALL hiển thị cho mỗi Reference_Entry một tên hoặc mô tả bằng tiếng Việt không rỗng và một đoạn mã LaTeX nguồn không rỗng tương ứng, đồng thời hiển thị cả hai thành phần này cho mọi Reference_Entry.
2. THE Formula_Reference SHALL nhóm mỗi Reference_Entry vào đúng một Reference_Category và SHALL bảo đảm mỗi Reference_Category được liệt kê chứa tối thiểu một Reference_Entry.
3. THE Formula_Reference SHALL bao gồm các Reference_Category cho công thức toán phổ biến, tối thiểu gồm tám nhóm: phân số, lũy thừa và chỉ số dưới, căn thức, tổng và tích, giới hạn, đạo hàm và tích phân, ma trận, và ký hiệu Hy Lạp.
4. THE Formula_Reference SHALL bao gồm một Reference_Category cho cú pháp soạn đề đặc thù của hệ thống, tối thiểu gồm sáu mục: môi trường `question`, môi trường `choice`, môi trường `statement`, lệnh `answer`, lệnh `explanation`, và cú pháp chèn ảnh `image`.
5. THE Formula_Reference SHALL hiển thị mỗi đoạn mã LaTeX nguồn dưới dạng văn bản đơn cách (monospace) để Author đọc được cú pháp chính xác.

### Requirement 3: Xem trước kết quả render công thức

**User Story:** Là một người soạn đề, tôi muốn xem trước kết quả hiển thị của từng công thức, để tôi xác nhận biểu thức hiển thị đúng như mong đợi trước khi dùng.

#### Acceptance Criteria

1. WHEN một Reference_Entry biểu diễn một công thức toán được hiển thị, THE Formula_Reference SHALL hiển thị bản xem trước của công thức bằng Katex_Renderer trong vòng tối đa 1 giây.
2. IF việc render một Reference_Entry bằng Katex_Renderer thất bại, THEN THE Formula_Reference SHALL hiển thị đoạn mã LaTeX nguồn của mục đó kèm một chỉ báo lỗi quan sát được thay cho bản xem trước.
3. WHERE đoạn mã LaTeX nguồn của một Reference_Entry rỗng hoặc chỉ chứa khoảng trắng, THE Formula_Reference SHALL không cố gắng render bản xem trước và SHALL chỉ hiển thị đoạn mã nguồn.
4. THE Formula_Reference SHALL sử dụng cùng cơ chế render KaTeX mà phần xem trước câu hỏi của Authoring_Workspace đang dùng, sao cho cùng một đoạn mã nguồn cho ra kết quả render giống nhau giữa Formula_Reference và phần xem trước câu hỏi.

### Requirement 4: Chèn nhanh công thức vào trình soạn thảo

**User Story:** Là một người soạn đề, tôi muốn chèn một công thức từ bảng tra cứu vào trình soạn thảo tại vị trí con trỏ, để tôi soạn nhanh hơn mà không phải gõ lại cú pháp.

#### Acceptance Criteria

1. THE Formula_Reference SHALL cung cấp một điều khiển chèn cho mỗi Reference_Entry.
2. WHEN Author kích hoạt điều khiển chèn của một Reference_Entry trong khi Latex_Editor không có vùng chọn, THE Authoring_Workspace SHALL chèn đoạn mã LaTeX nguồn của mục đó vào Latex_Editor tại vị trí con trỏ hiện tại thông qua lệnh `insertText`.
3. WHEN Author kích hoạt điều khiển chèn của một Reference_Entry trong khi Latex_Editor đang có một vùng chọn, THE Authoring_Workspace SHALL thay thế văn bản đang chọn bằng đoạn mã LaTeX nguồn của mục đó thông qua lệnh `insertText`.
4. WHEN Author kích hoạt điều khiển chèn của một Reference_Entry, THE Authoring_Workspace SHALL đặt con trỏ ngay sau đoạn mã vừa chèn.
5. WHEN Author kích hoạt điều khiển chèn của một Reference_Entry, THE Authoring_Workspace SHALL đặt tiêu điểm trở lại Latex_Editor sau khi chèn.
6. WHILE Authoring_Workspace ở Published_State, THE Formula_Reference SHALL vô hiệu hóa điều khiển chèn của mọi Reference_Entry sao cho không thể kích hoạt bằng chuột hoặc bàn phím.
7. WHILE Authoring_Workspace ở Published_State, IF việc kích hoạt một điều khiển chèn vẫn được cố gắng thực hiện, THEN THE Authoring_Workspace SHALL giữ nguyên nội dung văn bản và vị trí con trỏ của Latex_Editor.

### Requirement 5: Tìm kiếm trong bảng tra cứu

**User Story:** Là một người soạn đề, tôi muốn lọc danh sách công thức theo từ khóa, để tôi tìm nhanh công thức cần dùng khi danh sách dài.

#### Acceptance Criteria

1. THE Formula_Reference SHALL cung cấp một ô nhập từ khóa tìm kiếm cho phép nhập tối đa 100 ký tự.
2. WHEN Author thay đổi từ khóa trong ô tìm kiếm, THE Formula_Reference SHALL cập nhật danh sách hiển thị trong vòng tối đa 300 mili-giây kể từ lần gõ phím cuối cùng.
3. WHEN Author nhập một từ khóa khác rỗng, THE Formula_Reference SHALL chỉ hiển thị các Reference_Entry có tên, mô tả, hoặc đoạn mã LaTeX nguồn chứa từ khóa đó như một chuỗi con, không phân biệt chữ hoa chữ thường, sau khi đã loại bỏ khoảng trắng ở đầu và cuối từ khóa.
4. WHEN Author nhập một từ khóa khác rỗng, THE Formula_Reference SHALL ẩn mọi Reference_Category không còn Reference_Entry nào khớp.
5. IF không có Reference_Entry nào khớp với từ khóa tìm kiếm khác rỗng, THEN THE Formula_Reference SHALL không hiển thị Reference_Entry nào và SHALL hiển thị một thông báo cho biết không có kết quả phù hợp.
6. WHILE ô tìm kiếm rỗng hoặc chỉ chứa khoảng trắng, THE Formula_Reference SHALL hiển thị toàn bộ Reference_Entry.

### Requirement 6: Khả năng truy cập và hiển thị đáp ứng

**User Story:** Là một người soạn đề, tôi muốn bảng tra cứu dễ thao tác trên cả màn hình lớn và thiết bị di động, để tôi sử dụng được trong mọi bối cảnh soạn đề.

#### Acceptance Criteria

1. THE Formula_Reference SHALL cung cấp nhãn truy cập (accessible name) không rỗng cho điều khiển mở, điều khiển đóng, và mỗi điều khiển chèn của từng Reference_Entry.
2. WHILE Formula_Reference đang hiển thị trên màn hình có chiều rộng nhỏ hơn 768 pixel (CSS pixel), THE Formula_Reference SHALL hiển thị toàn bộ nội dung trong một vùng cuộn được, sao cho Author có thể cuộn đến và xem được mọi Reference_Entry.
3. WHILE Formula_Reference đang hiển thị trên màn hình có chiều rộng nhỏ hơn 768 pixel (CSS pixel), THE Formula_Reference SHALL để lộ ít nhất một phần nhìn thấy được của vùng nội dung chính của Authoring_Workspace hoặc một điều khiển đóng luôn hiển thị, sao cho Author không bị mất quyền truy cập vào nội dung chính.
4. WHEN Author kích hoạt điều khiển chèn của một Reference_Entry bằng phím Enter hoặc phím Space trong khi điều khiển đó đang nhận tiêu điểm bàn phím, THE Authoring_Workspace SHALL thực hiện hành động chèn giống hệt như khi kích hoạt bằng chuột.
5. WHEN Author kích hoạt điều khiển đóng bằng phím Enter hoặc phím Space trong khi điều khiển đó đang nhận tiêu điểm bàn phím, THE Authoring_Workspace SHALL thực hiện hành động đóng giống hệt như khi kích hoạt bằng chuột.
