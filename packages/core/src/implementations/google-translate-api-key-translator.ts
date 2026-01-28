// @ts-ignore - he doesn't have types
import * as he from "he";
import type { Translator } from "../interfaces";
import type { TranslatorConfig } from "../types";

const MAX_CHUNK_SIZE = 4500;

export class GoogleTranslateApiKeyTranslator implements Translator {
  constructor(
    private apiKey: string,
    private debug: boolean = false
  ) {}

  async translate(text: string, config: TranslatorConfig): Promise<string> {
    if (!text || text.trim().length === 0) {
      return "";
    }

    if (this.debug) {
      console.debug(
        `[GoogleTranslate] Translating from ${config.from} to ${config.to}, length: ${text.length}`
      );
    }

    try {
      // Split into chunks if needed
      const chunks = this.splitIntoChunks(text, MAX_CHUNK_SIZE);
      const translatedChunks: string[] = [];

      for (const chunk of chunks) {
        const translated = await this.translateChunk(chunk, config);
        translatedChunks.push(translated);
      }

      const result = translatedChunks.join("\n");
      
      // Decode HTML entities
      const decoded = he.decode(result);

      if (this.debug) {
        console.debug(`[GoogleTranslate] Translation successful, length: ${decoded.length}`);
      }

      return decoded;
    } catch (error) {
      if (this.debug) {
        console.debug(`[GoogleTranslate] Error:`, error);
      }
      throw error;
    }
  }

  private async translateChunk(
    text: string,
    config: TranslatorConfig
  ): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;

    const body = {
      q: text,
      source: config.from,
      target: config.to,
      format: "text",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Google Translate API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as {
      error?: unknown;
      data?: {
        translations?: Array<{ translatedText?: string }>;
      };
    };

    if (data.error) {
      throw new Error(`Google Translate API error: ${JSON.stringify(data.error)}`);
    }

    if (!data.data || !data.data.translations || data.data.translations.length === 0) {
      throw new Error("Google Translate API returned no translations");
    }

    return data.data.translations[0].translatedText || "";
  }

  private splitIntoChunks(text: string, maxSize: number): string[] {
    if (text.length <= maxSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = "";

    // Try to split on sentence boundaries first, then on spaces
    const sentences = text.split(/([.!?]\s+)/);
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const testChunk = currentChunk + sentence;

      if (testChunk.length <= maxSize) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // If single sentence is too long, split by spaces
        if (sentence.length > maxSize) {
          const words = sentence.split(/\s+/);
          let wordChunk = "";
          
          for (const word of words) {
            if ((wordChunk + " " + word).length <= maxSize) {
              wordChunk = wordChunk ? wordChunk + " " + word : word;
            } else {
              if (wordChunk) {
                chunks.push(wordChunk);
              }
              wordChunk = word;
            }
          }
          
          currentChunk = wordChunk;
        } else {
          currentChunk = sentence;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [text];
  }
}

