export function createAllowlistGuard(options?: {
  allowedChatIds?: string[];
  allowedUserIds?: string[];
}) {
  const allowedChatIds = options?.allowedChatIds;
  const allowedUserIds = options?.allowedUserIds;

  return {
    isAllowed(input: { chatId: string; userId: string }) {
      const chatAllowed = !allowedChatIds || allowedChatIds.includes(input.chatId);
      const userAllowed = !allowedUserIds || allowedUserIds.includes(input.userId);
      return chatAllowed && userAllowed;
    },
  };
}
