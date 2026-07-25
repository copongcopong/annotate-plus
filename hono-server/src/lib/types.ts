// Shared types for the annotate sync server.

export interface Reply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  page: string;
  url: string;
  type: string;
  author: string;
  text: string;
  color: string;
  anchor: unknown;
  geom: unknown;
  resolved: boolean;
  replies: Reply[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreFile {
  domain: string;
  page: string;
  comments: Comment[];
}

export interface SyncRequest {
  action: "upsert" | "delete";
  comment?: Comment;
  annotateId?: string;
}
