import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "HumanGov",
  description: "One Human. One Vote. Any Chain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-human-900 text-[#e6edf3] min-h-screen antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#161b22",
              color: "#e6edf3",
              border: "1px solid #21262d",
            },
          }}
        />
      </body>
    </html>
  );
}
