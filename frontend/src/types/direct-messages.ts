export interface DirectUser {
  id: string;
  username: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  content: string;
  sentAt: string;
  sender: DirectUser;
}

export interface DirectConversation {
  id: string;
  createdAt: string;
  otherUser: DirectUser;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    sentAt: string;
  } | null;
}

export interface DirectMessagePage {
  messages: DirectMessage[];
  nextCursor: string | null;
}
