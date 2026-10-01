import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EMOJI_CATALOG_VERSION, EMOJI_CATEGORIES } from './emoji-catalog';

/** Görsellerin servis edildiği yol (main.ts → useStaticAssets). */
export const EMOJI_IMAGE_PATH = '/api/static/emoji';

@ApiTags('Emoji')
@ApiBearerAuth()
@Controller('emojis')
export class EmojiController {
  @Get()
  @ApiOperation({ summary: 'Shared emoji catalog for the status/mood picker' })
  @Header('Cache-Control', 'private, max-age=3600')
  getCatalog() {
    return {
      version: EMOJI_CATALOG_VERSION,
      imagePath: EMOJI_IMAGE_PATH,
      categories: EMOJI_CATEGORIES,
    };
  }
}
