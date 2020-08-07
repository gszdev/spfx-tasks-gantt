import * as React from 'react';
import styles from './SpfxTasksGantt.module.scss';
import { ISpfxTasksGanttProps } from './ISpfxTasksGanttProps';
import { escape, findIndex, find } from '@microsoft/sp-lodash-subset';
import { GanttService } from '../services/GanttService';
import { Shimmer } from 'office-ui-fabric-react/lib/Shimmer';
import { ITask } from '../models/ITask';
import TaskViewEditPanel from './TaskViewEditPanel/TaskViewEditPanel';
import { Site } from '@pnp/sp/sites';
import { IDropdownOption, IPersonaProps, Text } from 'office-ui-fabric-react';
import { equalDatesNoTime } from '../funcs';
import { GanttChart } from './GanttChart/GanttChart';
import { IUser } from '../models/IUser';
import { IPredecessor } from '../models/IPredecessor';
import TasksList from './TasksList/TasksList';


interface ISpfxTasksGanttState {
  tasks: ITask[];
  isOpen: boolean;
  selectedTaskId: ITask['id'];
  updatedSelectedTaskProperties: Object;
  statusOptions: IDropdownOption[];
  priorityOptions: IDropdownOption[];
  predecessorOptions: IDropdownOption[];
}

export default class SpfxTasksGantt extends React.Component<ISpfxTasksGanttProps, ISpfxTasksGanttState> {

  private _ganttService: GanttService;

  constructor(props: ISpfxTasksGanttProps) {
    super(props);

    this.state = {
      tasks: null,
      isOpen: false,
      selectedTaskId: null,
      updatedSelectedTaskProperties: {},
      statusOptions: null,
      priorityOptions: null,
      predecessorOptions: null
    };
  }

  public async componentDidMount() {
    const { tasksListSiteUrl, tasksListTitle } = this.props;

    this._ganttService = GanttService.getInstance();
    let tasks = await this._ganttService.getTasks(tasksListSiteUrl, tasksListTitle);
    let statusOptions = await this._ganttService.getStatusDropdownOptions(tasksListSiteUrl, tasksListTitle);
    let priorityOptions = await this._ganttService.getPriorityDropdownOptions(tasksListSiteUrl, tasksListTitle);
    let predecessorOptions: IDropdownOption[] = tasks.map(task => ({ text: task.title, key: `${task.id}` }));
    this.setState({
      tasks: tasks,
      statusOptions: statusOptions,
      priorityOptions: priorityOptions,
      predecessorOptions: predecessorOptions
    });
  }

  public openTaskViewEditPanel = (taskId: number) => {
    this.setState({
      selectedTaskId: taskId,
      isOpen: true
    });
  }

  public setIsOpen = (isOpen: boolean) => {
    this.setState({
      isOpen: isOpen
    });
  }

  public onTaskPropertyChange = async (taskId: number, propertyName: string, propertyValue: any) => {
    const { tasksListSiteUrl, tasksListTitle } = this.props;
    let tasks = this.state.tasks.slice(0);
    let updatedTaskIndex = findIndex(tasks, (task) => {
      return task.id === taskId;
    });

    // If value hasn't changed, don't do anything
    // First check if value is date
    if (tasks[updatedTaskIndex][propertyName] && typeof tasks[updatedTaskIndex][propertyName].getMonth === 'function') {
      if (equalDatesNoTime(tasks[updatedTaskIndex][propertyName], propertyValue)) {
        return;
      }
    }
    else {
      if (tasks[updatedTaskIndex][propertyName] === propertyValue) {
        return;
      }
    }

    await this._ganttService.updateTask(tasksListSiteUrl, tasksListTitle, taskId, propertyName, propertyValue);

    tasks[updatedTaskIndex] = { ...tasks[updatedTaskIndex], ...{[propertyName] : propertyValue}};
    this.setState({
      tasks: tasks
    });
  }

  public onTaskPersonPropertyChange = async (taskId: number, propertyName: string, propertyValue: IUser[]) => {
    const { tasksListSiteUrl, tasksListTitle } = this.props;
    let tasks = this.state.tasks.slice(0);
    let updatedTaskIndex = findIndex(tasks, (task) => {
      return task.id === taskId;
    });

    // If value hasn't changed, don't do anything
    let oldPersonValue = tasks[updatedTaskIndex][propertyName];
    if (!this.differentPersonaLists(oldPersonValue, propertyValue)) {
      return;
    }

    let personFieldName = `${propertyName}Id`;
    let users: { id: number, accountName: string }[] = [];
    for (let user of propertyValue) {
      if (user.id) {
        users.push({
          id: parseInt(user.id),
          accountName: user.accountName
        });
      }
      else {
        let usernameId = await this._ganttService.getUserIdByAccountName(tasksListSiteUrl, user.accountName);
        users.push(usernameId);
      }
    }

    let personFieldValue = {
      results: users.map(persona => persona.id)
    };

    await this._ganttService.updateTask(tasksListSiteUrl, tasksListTitle, taskId, personFieldName, personFieldValue);

    let propertiesWithIds = propertyValue.slice(0);

    // Add ids to users for state update
    propertiesWithIds.forEach(user => {
      const userWithId = find(users, usernameId => user.accountName === usernameId.accountName);
      user.id = `${userWithId.id}`;
    });

    tasks[updatedTaskIndex] = { ...tasks[updatedTaskIndex], ...{[propertyName] : propertiesWithIds}};
    this.setState({
      tasks: tasks
    });
  }

  public onTaskPredecessorsPropertyChange = async (taskId: number, predecessorIds: IPredecessor[]) => {
    const { tasksListSiteUrl, tasksListTitle } = this.props;
    let tasks = this.state.tasks.slice(0);
    let updatedTaskIndex = findIndex(tasks, (task) => {
      return task.id === taskId;
    });

    // If value hasn't changed, don't do anything
    let oldPredecessorsValue = tasks[updatedTaskIndex]['predecessors'];
    if (!this.differentPredecessorLists(oldPredecessorsValue, predecessorIds)) {
      return;
    }

    let predecessorFieldName = `predecessorsId`;
    let predecessorFieldValue = {
      results: predecessorIds.map(pre => pre.id)
    };

    await this._ganttService.updateTask(tasksListSiteUrl, tasksListTitle, taskId, predecessorFieldName, predecessorFieldValue);

    tasks[updatedTaskIndex] = { ...tasks[updatedTaskIndex], ...{['predecessors'] : predecessorIds}};
    this.setState({
      tasks: tasks
    });
  }

  public differentPersonaLists(list1: IUser[], list2: IUser[]): boolean {
    if (list1.length !== list2.length) {
      return true;
    }
    let listsAreDifferent = false;
    for (const persona of list1) {
      let personaPresentInOtherList = find(list2, p2 => (p2.id === persona.id || p2.accountName === persona.accountName));
      if (!personaPresentInOtherList) {
        listsAreDifferent = true;
        break;
      }
    }
    return listsAreDifferent;
  }

  public differentPredecessorLists(list1: IPredecessor[], list2: IPredecessor[]): boolean {
    if (list1.length !== list2.length) {
      return true;
    }
    const listsAreDifferent = list1.every(pre => (list2.filter(pre2 => pre2.id === pre.id)).length > 0);
    return listsAreDifferent;
  }

  public toggleTaskStatus = async (taskId: number, isComplete: boolean) => {
    const { tasksListSiteUrl, tasksListTitle } = this.props;
    let tasks = this.state.tasks.slice(0);
    let updatedTaskIndex = findIndex(tasks, (task) => {
      return task.id === taskId;
    });

    let status = isComplete ? 'Completed' : (tasks[updatedTaskIndex].percentComplete > 0 ? 'In Progress' : 'Not Started');

    await this._ganttService.updateTask(tasksListSiteUrl, tasksListTitle, taskId, 'status', status);

    tasks[updatedTaskIndex] = { ...tasks[updatedTaskIndex], ...{['status'] : status}};
    this.setState({
      tasks: tasks
    });
  }

  public render(): React.ReactElement<ISpfxTasksGanttProps> {
    const { tasks, isOpen, selectedTaskId, statusOptions, predecessorOptions, priorityOptions } = this.state;
    const { tasksListTitle } = this.props;

    let selectedTask = this.state.tasks && this.state.tasks.filter(task => task.id === selectedTaskId)[0];

    return (
      <div className={ styles.spfxTasksGantt }>
        {tasks === null &&
          <Shimmer />
        }
        {tasks && tasks.length === 0 &&
          <div>No tasks found.</div>
        }
        {tasks && tasks.length > 0 && statusOptions &&
          <div className={styles.container}>
            <div className={styles.header}>
              <div>
                <Text variant='large'>{ tasksListTitle }</Text>
              </div>
            </div>
            <div className={styles.body}>
              <div className={styles.leftCol}>
                <TasksList 
                  tasks={tasks}
                  onTaskClick={this.openTaskViewEditPanel}
                  onTaskCompletionToggle={this.toggleTaskStatus}
                />
              </div>
              <div className={styles.rightCol}>
                <GanttChart 
                  tasks={tasks}
                  onTaskClick={this.openTaskViewEditPanel}
                />
              </div>
            </div>
            {selectedTask &&
              <TaskViewEditPanel 
                isPanelOpen={isOpen}
                task={selectedTask}
                setIsPanelOpen={this.setIsOpen}
                onPropertyChange={this.onTaskPropertyChange}
                onPersonPropertyChange={this.onTaskPersonPropertyChange}
                onPredecessorsPropertyChange={this.onTaskPredecessorsPropertyChange}
                statusOptions={statusOptions}
                priorityOptions={priorityOptions}
                predecessorOptions={predecessorOptions}
              />
            }
          </div>
        }
      </div>
    );
  }
}
