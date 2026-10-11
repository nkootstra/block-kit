import "@nkootstra/block-kit/styles.css";
import type { ReactNode } from "react";

export const metadata = { title: "Block Kit: keep the bot token on the server" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}
      >
        {children}
      </body>
    </html>
  );
}
