import { Controller, Post, Body, Delete, Param, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateGroupDto,
  JoinGroupDto,
  MuteGroupDto,
  RespondRequestDto,
  UpdateGroupDto,
  UpdateNotificationsDto,
  UpdateOptionsDto,
} from './dto';

@ApiTags('Groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user.id, dto.name);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a group by invite code' })
  async join(@CurrentUser() user: { id: string }, @Body() dto: JoinGroupDto) {
    return this.groupsService.joinGroup(user.id, dto.inviteCode);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave a group' })
  async leave(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.leaveGroup(user.id, groupId);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the group (admin only)' })
  async removeMember(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.groupsService.removeMember(user.id, groupId, targetUserId);
  }

  @Post(':id/join-request')
  @ApiOperation({ summary: 'Request to join a group' })
  async requestJoin(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.requestToJoin(user.id, groupId);
  }

  @Get(':id/requests')
  @ApiOperation({ summary: 'Get pending join requests (admin only)' })
  async getRequests(@CurrentUser() user: { id: string }, @Param('id') groupId: string) {
    return this.groupsService.getGroupRequests(user.id, groupId);
  }

  @Post(':id/requests/:requestId/respond')
  @ApiOperation({ summary: 'Respond to a join request (admin only)' })
  async respondToRequest(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RespondRequestDto,
  ) {
    return this.groupsService.respondToRequest(user.id, groupId, requestId, dto.response);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update group name/description (admin only)' })
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(user.id, groupId, dto);
  }

  @Put(':id/options')
  @ApiOperation({ summary: 'Replace group status/mood option lists (owner, premium)' })
  async updateOptions(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: UpdateOptionsDto,
  ) {
    return this.groupsService.updateOptions(user.id, groupId, dto);
  }

  @Patch(':id/notifications')
  @ApiOperation({ summary: 'Update my notification preferences for this group' })
  async updateNotifications(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.groupsService.updateNotificationPrefs(user.id, groupId, dto);
  }

  @Post(':id/mute')
  @ApiOperation({
    summary: '(Legacy) Mute/unmute group notifications — use PATCH :id/notifications',
  })
  async mute(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: MuteGroupDto,
  ) {
    return this.groupsService.muteGroup(user.id, groupId, dto.isMuted);
  }
}
