import type { AuthoringMode } from './types';

export const questionTemplate = String.raw`\begin{question}[type=multiple_choice,difficulty=2,code={MATH_SAMPLE_01}]
Cho hàm số $f(x)=x^2-2x+1$. Giá trị nhỏ nhất của hàm số là bao nhiêu?

\begin{choice}[correct,label=A]
$0$
\end{choice}

\begin{choice}[label=B]
$1$
\end{choice}

\begin{choice}[label=C]
$-1$
\end{choice}

\begin{choice}[label=D]
$2$
\end{choice}

\explanation{Ta có $f(x)=(x-1)^2$, nên giá trị nhỏ nhất bằng $0$.}
\end{question}`;

export const paperTemplate = String.raw`\begin{exam}
\begin{question}[type=multiple_choice,difficulty=2,section={I}]
Nội dung câu hỏi trắc nghiệm.

\begin{choice}[correct,label=A]
Phương án A
\end{choice}
\begin{choice}[label=B]
Phương án B
\end{choice}
\begin{choice}[label=C]
Phương án C
\end{choice}
\begin{choice}[label=D]
Phương án D
\end{choice}
\end{question}

\begin{question}[type=true_false,difficulty=2,section={II}]
Xét các mệnh đề sau:
\begin{statement}[correct=true,label=a]
Mệnh đề thứ nhất.
\end{statement}
\begin{statement}[correct=false,label=b]
Mệnh đề thứ hai.
\end{statement}
\end{question}

\begin{question}[type=short_answer,difficulty=3,section={III}]
Tính giá trị của $2+2$.
\answer{4}
\end{question}
\end{exam}`;

export function getAuthoringTemplate(mode: AuthoringMode) {
  return mode === 'paper' ? paperTemplate : questionTemplate;
}
