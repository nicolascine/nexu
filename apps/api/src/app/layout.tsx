import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'nexu API',
  description: 'API for nexu - RAG for codebases',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
