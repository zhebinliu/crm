import { Module } from '@nestjs/common';
import { ActionRegistry } from '@tokenwave/rule-engine';
import { RecordMutatorService } from '../record-mutator.service';
import { FieldUpdateAction } from './executors/field-update.action';
import { CreateTaskAction } from './executors/create-task.action';
import { SendWebhookAction } from './executors/send-webhook.action';
import { EmitEventAction } from './executors/emit-event.action';
import { SendNotificationAction } from './executors/send-notification.action';
import { SubmitForApprovalAction } from './executors/submit-for-approval.action';
import { LogAction } from './executors/log.action';

export const ACTION_REGISTRY = Symbol('ACTION_REGISTRY');

@Module({
  providers: [
    RecordMutatorService,
    FieldUpdateAction,
    CreateTaskAction,
    SendWebhookAction,
    EmitEventAction,
    SendNotificationAction,
    SubmitForApprovalAction,
    LogAction,
    {
      provide: ACTION_REGISTRY,
      useFactory: (
        fieldUpdate: FieldUpdateAction,
        createTask: CreateTaskAction,
        webhook: SendWebhookAction,
        emitEvent: EmitEventAction,
        notif: SendNotificationAction,
        submitApproval: SubmitForApprovalAction,
        logAct: LogAction,
      ) => {
        const reg = new ActionRegistry();
        reg.register(fieldUpdate);
        reg.register(createTask);
        reg.register(webhook);
        reg.register(emitEvent);
        reg.register(notif);
        reg.register(submitApproval);
        reg.register(logAct);
        return reg;
      },
      inject: [
        FieldUpdateAction,
        CreateTaskAction,
        SendWebhookAction,
        EmitEventAction,
        SendNotificationAction,
        SubmitForApprovalAction,
        LogAction,
      ],
    },
  ],
  exports: [ACTION_REGISTRY, RecordMutatorService],
})
export class ActionsModule {}
