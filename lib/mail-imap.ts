import "server-only";
import { ImapFlow } from "imapflow";

export function imapClient(email: string, password: string) {
  return new ImapFlow({
    host: "imap.secureserver.net",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 30000,
  });
}
