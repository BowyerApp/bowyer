import { TelegramMiniApp } from "@/components/telegram/mini-app";

export const metadata = {
  title: "Telegram Command Center",
  robots: { index: false, follow: false },
};

export default function TelegramPage() {
  return <TelegramMiniApp />;
}
