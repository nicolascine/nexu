import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'nexu',
  description: 'RAG for codebases',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
