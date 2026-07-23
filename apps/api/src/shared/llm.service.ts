import { Injectable } from "@nestjs/common";
import { createLlmProvider, type LlmProvider } from "@keystone/ai";

@Injectable()
export class LlmService {
  readonly provider: LlmProvider = createLlmProvider();
}
