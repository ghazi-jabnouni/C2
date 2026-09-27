import cron from 'node-cron';
import { ScheduleModel } from '../models/schedule.model.js';
import { TaskModel } from '../models/task.model.js';
import { startTemplateExecution } from '../controllers/template.controller.js';

const scheduledTasks = new Map();

function updateNextRun(scheduleId, task) {
  const nextRun = task.getNextRun();
  ScheduleModel.update(scheduleId, { nextRun: nextRun ? nextRun.toISOString() : null });
}

async function runSchedule(scheduleId) {
  const schedule = ScheduleModel.findById(scheduleId);
  if (!schedule?.enabled) return;

  const runAt = new Date().toISOString();
  try {
    const task = startTemplateExecution(schedule.templateId, {
      triggeredBy: `Schedule: ${schedule.templateName}`
    });
    if (!task) throw new Error(`Scheduled template '${schedule.templateId}' was not found.`);
    const scheduledTask = scheduledTasks.get(scheduleId);
    ScheduleModel.update(scheduleId, {
      lastRun: runAt,
      nextRun: scheduledTask?.getNextRun()?.toISOString() || null
    });
    console.log(`[scheduler] Started task ${task.id} for schedule ${scheduleId}`);
    let currentTask = task;
    while (currentTask?.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      currentTask = TaskModel.findById(task.id);
    }
    if (currentTask?.status === 'failed') {
      console.error(`[scheduler] Task ${task.id} for schedule ${scheduleId} failed.`);
    }
  } catch (error) {
    const scheduledTask = scheduledTasks.get(scheduleId);
    ScheduleModel.update(scheduleId, {
      lastRun: runAt,
      nextRun: scheduledTask?.getNextRun()?.toISOString() || null
    });
    console.error(`[scheduler] Failed schedule ${scheduleId}:`, error);
  }
}

export const ScheduleRunner = {
  validate(expression) {
    return cron.validate(expression);
  },

  initialize() {
    for (const schedule of ScheduleModel.findAll()) {
      try {
        this.sync(schedule);
      } catch (error) {
        console.error(`[scheduler] Could not register schedule ${schedule.id}:`, error);
      }
    }
    console.log(`[scheduler] Registered ${scheduledTasks.size} enabled schedule(s) in UTC`);
  },

  sync(schedule) {
    this.remove(schedule.id, false);
    if (!schedule.enabled) {
      ScheduleModel.update(schedule.id, { nextRun: null });
      return;
    }
    if (!cron.validate(schedule.cron)) throw new Error('Invalid cron expression.');

    const task = cron.schedule(schedule.cron, () => {
      void runSchedule(schedule.id);
    }, {
      name: schedule.id,
      timezone: 'UTC',
      noOverlap: true
    });
    scheduledTasks.set(schedule.id, task);
    updateNextRun(schedule.id, task);
  },

  remove(scheduleId, clearNextRun = true) {
    const task = scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      task.destroy();
      scheduledTasks.delete(scheduleId);
    }
    if (clearNextRun) ScheduleModel.update(scheduleId, { nextRun: null });
  },

  stopAll() {
    for (const scheduleId of scheduledTasks.keys()) this.remove(scheduleId, false);
  }
};

export default ScheduleRunner;