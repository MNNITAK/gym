import { Injectable } from "@nestjs/common";
import { WhatsAppClient } from "@keystone/whatsapp";

@Injectable()
export class WhatsAppService {
  readonly client = new WhatsAppClient({
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  });

  send(toPhone: string, body: string) {
    return this.client.sendText(toPhone, body);
  }
}
