import type { ComponentType } from "react";
import type { ElementProps } from "../types";
import { Button } from "./Button";
import { Checkboxes } from "./Checkboxes";
import { DatePicker } from "./DatePicker";
import { DateTimePicker } from "./DateTimePicker";
import { FeedbackButtons } from "./FeedbackButtons";
import { FileInput } from "./FileInput";
import { IconButton } from "./IconButton";
import { ImageElement } from "./ImageElement";
import { Overflow } from "./Overflow";
import { RadioButtons } from "./RadioButtons";
import { RichTextInput } from "./RichTextInput";
import { Select } from "./Select";
import { TextInput } from "./TextInput";
import { TimePicker } from "./TimePicker";
import { WorkflowButton } from "./WorkflowButton";

export const elementComponents: Record<string, ComponentType<ElementProps<any>>> = {
  button: Button,
  channels_select: Select,
  checkboxes: Checkboxes,
  conversations_select: Select,
  datepicker: DatePicker,
  datetimepicker: DateTimePicker,
  email_text_input: TextInput,
  external_select: Select,
  feedback_buttons: FeedbackButtons,
  file_input: FileInput,
  icon_button: IconButton,
  image: ImageElement,
  multi_channels_select: Select,
  multi_conversations_select: Select,
  multi_external_select: Select,
  multi_static_select: Select,
  multi_users_select: Select,
  number_input: TextInput,
  overflow: Overflow,
  plain_text_input: TextInput,
  radio_buttons: RadioButtons,
  rich_text_input: RichTextInput,
  static_select: Select,
  timepicker: TimePicker,
  url_text_input: TextInput,
  users_select: Select,
  workflow_button: WorkflowButton,
};
