export type MessageDescriptor = {
  key: string;
  defaultMessage: string;
  description?: string;
};

export function defineMessage<T extends MessageDescriptor>(message: T): T {
  return message;
}

export function defineMessages<T extends Record<string, MessageDescriptor>>(messages: T): T {
  return messages;
}
