import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Post()
  async update(
    @CurrentUser() user: { id: string; displayName: string },
    @Body('groupId') groupId: string,
    @Body('text') text: string,
    @Body('emoji') emoji?: string,
    @Body('mood') mood?: string,
  ) {
    return this.statusService.updateStatus(user.id, user.displayName, groupId, text, emoji, mood);
  }
}
