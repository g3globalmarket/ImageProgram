import type { Translator } from "../interfaces";
import type { TranslatorConfig } from "../types";

export class StubTranslator implements Translator {
  async translate(text: string, config: TranslatorConfig): Promise<string> {
    // Stub: returns a deterministic "translated" string
    return `[${config.to}] ${text}`;
  }
}

