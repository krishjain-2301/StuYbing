export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

export type Room = {
  id: string;
  room_code: string;
  name: string;
  description: string | null;
  is_private: boolean;
  owner_id: string;
  created_at: string;
};

export type RoomMember = {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  profiles?: Profile | null;
};

export type StudySession = {
  id: string;
  user_id: string;
  room_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  last_heartbeat_at: string | null;
};

export type TaskPriority = "high" | "medium" | "low";

export type Task = {
  id: string;
  user_id: string;
  room_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  completed: boolean;
  deadline: string | null;
  created_at: string;
  completed_at: string | null;
};

export type MemberStatus = "studying" | "online" | "offline";

export type LeaderboardEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_seconds: number;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
};
