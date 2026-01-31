import { Controller, Post, Body, Delete, Param, UseGuards, Get, Patch } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async create(@CurrentUser() user: { id: string }, @Body('name') name: string) {
    return this.groupsService.createGroup(user.id, name);
  }

  @Post('join')
  async join(@CurrentUser() user: { id: string }, @Body('inviteCode') inviteCode: string) {
    return this.groupsService.joinGroup(user.id, inviteCode);
  }

  @Delete(':id/leave')
  async leave(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.leaveGroup(user.id, groupId);
  }

  @Post(':id/join-request')
  async requestJoin(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.requestToJoin(user.id, groupId);
  }

  // Admin only: Get pending requests
  @Get(':id/requests')
  async getRequests(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.getGroupRequests(user.id, groupId);
  }

  // Admin only: Respond to request
  @Post(':id/requests/:requestId/respond')
  async respondToRequest(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Param('requestId') requestId: string,
    @Body('response') response: 'APPROVED' | 'REJECTED',
  ) {
    return this.groupsService.respondToRequest(user.id, groupId, requestId, response);
  }
  @Patch(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body('name') name?: string,
    @Body('description') description?: string,
  ) {
    return this.groupsService.updateGroup(user.id, groupId, { name, description });
  }
  @Post(':id/moods')
  async addMood(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() data: { text: string; emoji?: string; mood: string },
  ) {
    return this.groupsService.addCustomMood(user.id, groupId, data);
  }

  @Post(':id/mute')
  async mute(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body('isMuted') isMuted: boolean,
  ) {
    return this.groupsService.muteGroup(user.id, groupId, isMuted);
  }
}
