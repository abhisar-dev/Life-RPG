import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";
const db = new Database("life-rpg.sqlite");

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use(express.json());

db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  gold INTEGER NOT NULL DEFAULT 120,
  streak INTEGER NOT NULL DEFAULT 0,
  last_completed TEXT,
  intellect INTEGER NOT NULL DEFAULT 0,
  strength INTEGER NOT NULL DEFAULT 0,
  vitality INTEGER NOT NULL DEFAULT 0,
  discipline INTEGER NOT NULL DEFAULT 0,
  creativity INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Medium',
  xp INTEGER NOT NULL DEFAULT 40,
  gold INTEGER NOT NULL DEFAULT 10,
  duration_seconds INTEGER NOT NULL DEFAULT 600,
  started_at TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  score_percent INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  badge_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, badge_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  UNIQUE(user_id, item_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Safe migration for databases created by earlier versions.
try { db.prepare("ALTER TABLE tasks ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 600").run(); } catch {}
try { db.prepare("ALTER TABLE tasks ADD COLUMN started_at TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE tasks ADD COLUMN questions TEXT NOT NULL DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE tasks ADD COLUMN score INTEGER NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE tasks ADD COLUMN score_percent INTEGER NOT NULL DEFAULT 0").run(); } catch {}

const xpForNext = level => 100 + Math.floor(75 * Math.pow(level - 1, 1.35));
const BADGES=[
  {key:"quiz-ace",name:"Quiz Ace",desc:"Score 4/5 or better on a playable quest."},
  {key:"quick-learner",name:"Quick Learner",desc:"Earn your second high-score badge."},
  {key:"sharp-mind",name:"Sharp Mind",desc:"Earn three high-score badges."},
  {key:"quest-scholar",name:"Quest Scholar",desc:"Earn four high-score badges."},
  {key:"combo-master",name:"Combo Master",desc:"Earn five high-score badges."},
  {key:"elite-player",name:"Elite Player",desc:"Earn six high-score badges."},
  {key:"xp-hunter",name:"XP Hunter",desc:"Earn seven high-score badges."},
  {key:"streak-forger",name:"Streak Forger",desc:"Earn eight high-score badges."},
  {key:"rpg-veteran",name:"RPG Veteran",desc:"Earn nine high-score badges."},
  {key:"life-rpg-legend",name:"Life RPG Legend",desc:"Earn ten high-score badges."}
];
const getBadges=userId=>{const unlocked=new Map(db.prepare("SELECT badge_key,unlocked_at FROM user_badges WHERE user_id=? ORDER BY id").all(userId).map(x=>[x.badge_key,x.unlocked_at]));return BADGES.map((b,i)=>({...b,number:i+1,unlocked:unlocked.has(b.key),unlockedAt:unlocked.get(b.key)||null}));};
const publicUser = u => ({
  id:u.id,name:u.name,email:u.email,xp:u.xp,level:u.level,gold:u.gold,streak:u.streak,
  attributes:{Intellect:u.intellect,Strength:u.strength,Vitality:u.vitality,Discipline:u.discipline,Creativity:u.creativity},
  bio:u.bio||"",avatarUrl:u.avatar_url||null,badges:getBadges(u.id)
});
function safeTask(t){
  let questions=[];
  try { questions=JSON.parse(t.questions||"[]").map(q=>({id:q.id,text:q.text,options:q.options})); } catch {}
  return {...t,questions};
}
function tokenFor(id){ return jwt.sign({id}, JWT_SECRET, {expiresIn:"7d"}); }
function auth(req,res,next){
  try {
    const raw=req.headers.authorization?.replace("Bearer ","");
    const decoded=jwt.verify(raw,JWT_SECRET);
    const user=db.prepare("SELECT * FROM users WHERE id=?").get(decoded.id);
    if(!user) return res.status(401).json({error:"Session expired"});
    req.user=user; next();
  } catch { res.status(401).json({error:"Unauthorized"}); }
}
function syncLevel(userId){
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  let level=u.level, xp=u.xp;
  while(xp >= xpForNext(level)){ xp -= xpForNext(level); level++; }
  db.prepare("UPDATE users SET xp=?,level=? WHERE id=?").run(xp,level,userId);
  return db.prepare("SELECT * FROM users WHERE id=?").get(userId);
}

app.get("/api/health",(_,res)=>res.json({ok:true,service:"Life RPG API"}));

app.post("/api/auth/signup", async (req,res)=>{
  const {name,email,password}=req.body;
  if(!name?.trim() || !email?.trim() || !password || password.length<6)
    return res.status(400).json({error:"Name, email and a 6+ character password are required."});
  try {
    const hash=await bcrypt.hash(password,12);
    const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name.trim(),email.trim().toLowerCase(),hash);
    const user=db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    res.status(201).json({token:tokenFor(user.id),user:publicUser(user)});
  } catch { res.status(409).json({error:"An account with that email already exists."}); }
});

app.post("/api/auth/login", async (req,res)=>{
  const {email,password}=req.body;
  const user=db.prepare("SELECT * FROM users WHERE email=?").get(email?.trim().toLowerCase());
  if(!user || !(await bcrypt.compare(password||"",user.password_hash)))
    return res.status(401).json({error:"Invalid email or password."});
  res.json({token:tokenFor(user.id),user:publicUser(user)});
});

app.get("/api/me",auth,(req,res)=>res.json({user:publicUser(req.user)}));

app.patch("/api/me",auth,(req,res)=>{
  const name=typeof req.body.name==="string"?req.body.name.trim():req.user.name;
  const bio=typeof req.body.bio==="string"?req.body.bio.trim():req.user.bio||"";
  const avatarUrl=req.body.avatarUrl===null?null:(typeof req.body.avatarUrl==="string"?req.body.avatarUrl:req.user.avatar_url||null);
  if(!name || name.length>40) return res.status(400).json({error:"Display name must be 1-40 characters."});
  if(bio.length>160) return res.status(400).json({error:"Bio must be 160 characters or less."});
  if(avatarUrl && (!avatarUrl.startsWith("data:image/") || avatarUrl.length>2_000_000)) return res.status(400).json({error:"Profile image must be a valid image under 1.5 MB."});
  db.prepare("UPDATE users SET name=?,bio=?,avatar_url=? WHERE id=?").run(name,bio,avatarUrl,req.user.id);
  res.json({user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id))});
});

app.get("/api/tasks",auth,(req,res)=>{
  const tasks=db.prepare("SELECT * FROM tasks WHERE user_id=? ORDER BY completed ASC, created_at DESC").all(req.user.id);
  res.json({tasks:tasks.map(safeTask)});
});

app.post("/api/tasks",auth,(req,res)=>{
  const {title,category="Discipline",difficulty="Medium",xp:customXp,durationMinutes=10,questions=[]}=req.body;
  if(!title?.trim()) return res.status(400).json({error:"Quest title is required."});
  const defaultXp={Easy:25,Medium:50,Hard:90}[difficulty]||50;
  const xp=Number.isFinite(Number(customXp)) ? Math.max(5,Math.min(500,Math.round(Number(customXp)))) : defaultXp;
  const gold={Easy:8,Medium:15,Hard:30}[difficulty]||15;
  const duration=Math.max(60,Math.min(10800,Math.round(Number(durationMinutes)||10)*60));
  const cleanQuestions=Array.isArray(questions)?questions.slice(0,10).map((q,i)=>({id:q.id||`q${i+1}`,text:String(q.text||"").trim().slice(0,300),options:Array.isArray(q.options)?q.options.slice(0,4).map(x=>String(x).slice(0,120)):[],answer:Number(q.answer)})).filter(q=>q.text&&q.options.length>=2&&q.options[q.answer]!==undefined):[];
  if(Array.isArray(questions)&&questions.length!==cleanQuestions.length) return res.status(400).json({error:"Each question needs text, at least 2 options, and one correct answer."});
  const info=db.prepare("INSERT INTO tasks(user_id,title,category,difficulty,xp,gold,duration_seconds,questions) VALUES(?,?,?,?,?,?,?,?)")
    .run(req.user.id,title.trim(),category,difficulty,xp,gold,duration,JSON.stringify(cleanQuestions));
  res.status(201).json({task:safeTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(info.lastInsertRowid))});
});

app.post("/api/tasks/:id/start",auth,(req,res)=>{
  const task=db.prepare("SELECT * FROM tasks WHERE id=? AND user_id=?").get(req.params.id,req.user.id);
  if(!task) return res.status(404).json({error:"Quest not found."});
  if(task.completed) return res.status(400).json({error:"Quest already completed."});
  const startedAt=task.started_at || new Date().toISOString();
  db.prepare("UPDATE tasks SET started_at=? WHERE id=? AND user_id=?").run(startedAt,task.id,req.user.id);
  res.json({task:safeTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id))});
});

app.patch("/api/tasks/:id/complete",auth,(req,res)=>{
  const task=db.prepare("SELECT * FROM tasks WHERE id=? AND user_id=?").get(req.params.id,req.user.id);
  if(!task) return res.status(404).json({error:"Quest not found."});
  if(task.completed) return res.status(400).json({error:"Quest already completed."});
  if(!task.started_at) return res.status(400).json({error:"Start the quest before submitting answers."});
  let questions=[]; try { questions=JSON.parse(task.questions||"[]"); } catch {}
  if(questions.length!==5) return res.status(400).json({error:"Playable quests must contain exactly 5 questions."});
  const answers=req.body.answers||{};
  const unanswered=questions.filter(q=>answers[q.id]===undefined);
  if(unanswered.length) return res.status(400).json({error:`Answer all 5 questions before submitting. ${unanswered.length} remain.`,unansweredIds:unanswered.map(q=>q.id)});
  const score=questions.reduce((sum,q)=>sum+(Number(answers[q.id])===Number(q.answer)?1:0),0);
  const scorePercent=Math.round(score/questions.length*100);
  const today=new Date().toISOString().slice(0,10);
  const last=req.user.last_completed;
  let streak=req.user.streak;
  if(last===today) {}
  else {
    const diff=last ? Math.round((new Date(today)-new Date(last))/86400000) : 0;
    streak = last && diff===1 ? streak+1 : 1;
  }
  db.prepare("UPDATE tasks SET completed=1,completed_at=?,score=?,score_percent=? WHERE id=? AND user_id=?")
    .run(new Date().toISOString(),score,scorePercent,task.id,req.user.id);
  const attrMap={Coding:"intellect",Study:"intellect",Gym:"strength",Health:"vitality",Discipline:"discipline",Creative:"creativity",Work:"discipline"};
  const col=attrMap[task.category]||"discipline";
  db.prepare(`UPDATE users SET xp=xp+?,gold=gold+?,streak=?,last_completed=?,${col}=${col}+1 WHERE id=?`)
    .run(task.xp,task.gold,streak,today,req.user.id);

  let badge=null;
  if(score>=4){
    const unlockedCount=db.prepare("SELECT COUNT(*) AS c FROM user_badges WHERE user_id=?").get(req.user.id).c;
    if(unlockedCount<10){
      const next=BADGES[unlockedCount];
      db.prepare("INSERT OR IGNORE INTO user_badges(user_id,badge_key) VALUES(?,?)").run(req.user.id,next.key);
      badge={...next,number:unlockedCount+1,unlocked:true};
    }
  }
  const updated=syncLevel(req.user.id);
  res.json({
    task:safeTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id)),
    user:publicUser(updated),
    result:{score,total:5,percent:scorePercent,passed:score>=4,badge}
  });
});

app.get("/api/badges",auth,(req,res)=>res.json({badges:getBadges(req.user.id)}));

app.delete("/api/tasks/:id",auth,(req,res)=>{
  const result=db.prepare("DELETE FROM tasks WHERE id=? AND user_id=?").run(req.params.id,req.user.id);
  if(!result.changes) return res.status(404).json({error:"Quest not found."});
  res.status(204).end();
});

const catalog=[
 {key:"neon-frame",name:"Neon Profile Frame",price:100,kind:"Cosmetic"},
 {key:"void-theme",name:"Void Theme",price:180,kind:"Theme"},
 {key:"gold-badge",name:"Gold Badge",price:250,kind:"Badge"},
 {key:"rank-banner",name:"Rank Banner",price:350,kind:"Cosmetic"}
];
app.get("/api/shop",auth,(req,res)=>res.json({items:catalog}));
app.get("/api/inventory",auth,(req,res)=>res.json({items:db.prepare("SELECT item_key FROM inventory WHERE user_id=?").all(req.user.id).map(x=>x.item_key)}));
app.post("/api/shop/buy",auth,(req,res)=>{
  const item=catalog.find(x=>x.key===req.body.key);
  if(!item) return res.status(404).json({error:"Item not found."});
  if(db.prepare("SELECT 1 FROM inventory WHERE user_id=? AND item_key=?").get(req.user.id,item.key))
    return res.status(409).json({error:"Item already owned."});
  if(req.user.gold<item.price) return res.status(400).json({error:"Not enough gold."});
  db.prepare("UPDATE users SET gold=gold-? WHERE id=?").run(item.price,req.user.id);
  db.prepare("INSERT INTO inventory(user_id,item_key) VALUES(?,?)").run(req.user.id,item.key);
  res.json({item,user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id))});
});

app.listen(PORT,()=>console.log(`Life RPG API running on http://localhost:${PORT}`));
