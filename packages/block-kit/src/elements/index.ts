import type { ComponentType } from "react";
import type { ElementProps } from "../types";
import { Button } from "./Button";
import { Checkboxes } from "./Checkboxes";
import { DatePicker } from "./DatePicker";
import { DateTimePicker } from "./DateTimePicker";
import { FeedbackButtons } from "./FeedbackButtons";
import { IconButton } from "./IconButton";
import { ImageElement } from "./ImageElement";
import { Overflow } from "./Overflow";
import { RadioButtons } from "./RadioButtons";
import { Select } from "./Select";
import { TimePicker } from "./TimePicker";
import { WorkflowButton } from "./WorkflowButton";

export const elementComponents: Record<string, ComponentType<ElementProps<any>>> = {
  button: Button,
  channels_select: Select,
  checkboxes: Checkboxes,
  conversations_select: Select,
  datepicker: DatePicker,
  datetimepicker: DateTimePicker,
  external_select: Select,
  feedback_buttons: FeedbackButtons,
  icon_button: IconButton,
  image: ImageElement,
  multi_channels_select: Select,
  multi_conversations_select: Select,
  multi_external_select: Select,
  multi_static_select: Select,
  multi_users_select: Select,
  overflow: Overflow,
  radio_buttons: RadioButtons,
  static_select: Select,
  timepicker: TimePicker,
  users_select: Select,
  workflow_button: WorkflowButton,
};
