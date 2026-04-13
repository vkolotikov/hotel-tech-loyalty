import{u as W,a as w,c as N,j as e}from"./vendor-query-uT6E891c.js";import{r as o}from"./vendor-react-DbwoY8gR.js";import{b as i,z as d}from"./index-DKr7qoIP.js";import"./vendor-charts-8Gr3J358.js";const q=[{value:"campaign",label:"Campaign"},{value:"transactional",label:"Transactional"},{value:"welcome",label:"Welcome"},{value:"birthday",label:"Birthday"},{value:"re-engagement",label:"Re-engagement"}],c=`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1c1c1e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #c9a84c; margin: 0; font-size: 22px; letter-spacing: 2px; }
    .body { padding: 40px; }
    .body h2 { color: #1c1c1e; margin: 0 0 16px; font-size: 20px; }
    .body p { color: #4a4a4a; line-height: 1.6; margin: 0 0 16px; font-size: 15px; }
    .cta { display: inline-block; background: #c9a84c; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .footer { background: #f4f4f7; padding: 24px 40px; text-align: center; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5; }
    .points-box { background: #fef9ee; border: 1px solid #f0dca0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .points-box .number { font-size: 36px; font-weight: 800; color: #c9a84c; }
    .points-box .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{hotel_name}}</h1>
    </div>
    <div class="body">
      <h2>Hello {{first_name}},</h2>
      <p>We have exciting news for you! As a valued {{tier_name}} member, you have access to exclusive offers.</p>
      <div class="points-box">
        <div class="number">{{points_balance}}</div>
        <div class="label">Your Points Balance</div>
      </div>
      <p>Don't miss out on the latest rewards and benefits available to you.</p>
      <p style="text-align: center; margin-top: 32px;">
        <a href="#" class="cta">View My Rewards</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; {{current_year}} {{hotel_name}}. All rights reserved.</p>
      <p>Member #{{member_number}} &middot; {{tier_name}} Tier</p>
    </div>
  </div>
</body>
</html>`,H=`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1c1c1e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #c9a84c; margin: 0; font-size: 22px; letter-spacing: 2px; }
    .body { padding: 40px; }
    .body h2 { color: #1c1c1e; margin: 0 0 16px; font-size: 20px; }
    .body p { color: #4a4a4a; line-height: 1.6; margin: 0 0 16px; font-size: 15px; }
    .cta { display: inline-block; background: #c9a84c; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .footer { background: #f4f4f7; padding: 24px 40px; text-align: center; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5; }
    .welcome-badge { background: linear-gradient(135deg, #c9a84c, #e8c96a); color: #fff; display: inline-block; padding: 8px 24px; border-radius: 20px; font-weight: 700; font-size: 14px; letter-spacing: 1px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{hotel_name}}</h1>
    </div>
    <div class="body">
      <p style="text-align: center;"><span class="welcome-badge">WELCOME</span></p>
      <h2>Hello {{first_name}},</h2>
      <p>Welcome to our loyalty program! We are thrilled to have you as a {{tier_name}} member.</p>
      <p>Your member number is <strong>#{{member_number}}</strong>. Use your referral code <strong>{{referral_code}}</strong> to invite friends and earn bonus points!</p>
      <p style="text-align: center; margin-top: 32px;">
        <a href="#" class="cta">Explore Your Benefits</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; {{current_year}} {{hotel_name}}. All rights reserved.</p>
      <p>Member #{{member_number}} &middot; {{tier_name}} Tier</p>
    </div>
  </div>
</body>
</html>`,U=`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 48px 24px; }
    .wrapper h2 { color: #111; margin: 0 0 20px; font-size: 22px; font-weight: 600; }
    .wrapper p { color: #555; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
    .cta { display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .divider { border: none; border-top: 1px solid #eee; margin: 32px 0; }
    .footer { color: #aaa; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <h2>Hi {{first_name}},</h2>
    <p>Your message goes here. Keep it short and personal.</p>
    <p style="margin-top: 28px;">
      <a href="#" class="cta">Take Action</a>
    </p>
    <hr class="divider">
    <p class="footer">{{hotel_name}} &middot; Member #{{member_number}}</p>
  </div>
</body>
</html>`,Y=[{label:"Points & Rewards",value:c,subject:"{{first_name}}, check your rewards!",category:"campaign"},{label:"Welcome Email",value:H,subject:"Welcome to {{hotel_name}}, {{first_name}}!",category:"welcome"},{label:"Minimal / Clean",value:U,subject:"",category:"campaign"}];function V(){const g=W(),[l,m]=o.useState(null),[k,p]=o.useState(!1),[_,u]=o.useState(!1),[C,E]=o.useState(""),[T,S]=o.useState(""),y=o.useRef(null),[r,s]=o.useState({name:"",subject:"",html_body:c,category:"campaign"}),{data:x,isLoading:P}=w({queryKey:["email-templates"],queryFn:()=>i.get("/v1/admin/email-templates").then(t=>t.data)}),{data:b}=w({queryKey:["merge-tags"],queryFn:()=>i.get("/v1/admin/email-templates/merge-tags").then(t=>t.data)}),f=N({mutationFn:t=>l?i.put(`/v1/admin/email-templates/${l.id}`,t):i.post("/v1/admin/email-templates",t),onSuccess:()=>{g.invalidateQueries({queryKey:["email-templates"]}),d.success(l?"Template updated":"Template created"),h()},onError:t=>{var a,n;return d.error(((n=(a=t.response)==null?void 0:a.data)==null?void 0:n.message)||"Save failed")}}),z=N({mutationFn:t=>i.delete(`/v1/admin/email-templates/${t}`),onSuccess:()=>{g.invalidateQueries({queryKey:["email-templates"]}),d.success("Template deleted")}}),h=()=>{m(null),p(!1),s({name:"",subject:"",html_body:c,category:"campaign"})},M=t=>{m(t),s({name:t.name,subject:t.subject,html_body:t.html_body,category:t.category}),p(!0)},v=()=>{m(null),s({name:"",subject:"",html_body:c,category:"campaign"}),p(!0)},L=t=>{const a=y.current;if(!a)return;const n=a.selectionStart,D=a.selectionEnd,B=r.html_body.slice(0,n),F=r.html_body.slice(D),I=B+t+F;s(O=>({...O,html_body:I})),setTimeout(()=>{a.focus(),a.selectionStart=a.selectionEnd=n+t.length},0)},R=async t=>{try{const{data:a}=await i.get(`/v1/admin/email-templates/${t}/preview`);E(a.html),S(a.subject),u(!0)}catch{d.error("Preview failed — make sure at least one member exists")}},j=(x==null?void 0:x.templates)??[],A=(b==null?void 0:b.tags)??{};return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold text-white",children:"Email Templates"}),e.jsx("p",{className:"text-sm text-t-secondary mt-1",children:"Build HTML email templates with merge tags for personalized campaigns"})]}),e.jsx("button",{onClick:v,className:"bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors",children:"+ New Template"})]}),P?e.jsx("div",{className:"text-center py-12 text-[#636366]",children:"Loading templates..."}):j.length===0?e.jsxs("div",{className:"bg-dark-surface rounded-xl border border-dark-border p-12 text-center",children:[e.jsx("div",{className:"text-4xl mb-3",children:"✉"}),e.jsx("p",{className:"text-t-secondary font-medium",children:"No email templates yet"}),e.jsx("p",{className:"text-sm text-[#636366] mt-1",children:"Create your first template to start sending email campaigns"}),e.jsx("button",{onClick:v,className:"mt-4 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700",children:"Create Template"})]}):e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",children:j.map(t=>e.jsxs("div",{className:"bg-dark-surface rounded-xl border border-dark-border overflow-hidden group",children:[e.jsxs("div",{className:"h-32 bg-[#1a1a1a] overflow-hidden relative",children:[e.jsx("iframe",{srcDoc:t.html_body,title:t.name,className:"w-[600px] h-[400px] origin-top-left pointer-events-none",style:{transform:"scale(0.35)",transformOrigin:"top left"},sandbox:""}),e.jsx("div",{className:"absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#1c1c1e]"})]}),e.jsxs("div",{className:"p-4",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-white text-sm",children:t.name}),e.jsx("p",{className:"text-xs text-[#636366] truncate mt-0.5",children:t.subject})]}),e.jsx("span",{className:`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.is_active?"bg-[#32d74b]/15 text-[#32d74b]":"bg-dark-surface3 text-t-secondary"}`,children:t.is_active?"Active":"Inactive"})]}),e.jsxs("div",{className:"flex items-center gap-1.5 flex-wrap mb-3",children:[e.jsx("span",{className:"px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/15 text-primary-400",children:t.category}),(t.merge_tags??[]).length>0&&e.jsxs("span",{className:"text-[10px] text-[#636366]",children:[t.merge_tags.length," tag",t.merge_tags.length!==1?"s":""]})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{onClick:()=>M(t),className:"flex-1 text-xs font-semibold text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 rounded-lg py-1.5 transition-colors",children:"Edit"}),e.jsx("button",{onClick:()=>R(t.id),className:"flex-1 text-xs font-semibold text-t-secondary hover:text-white bg-dark-surface2 hover:bg-dark-surface3 rounded-lg py-1.5 transition-colors",children:"Preview"}),e.jsx("button",{onClick:()=>{confirm("Delete this template?")&&z.mutate(t.id)},className:"text-xs font-semibold text-[#ff375f] hover:text-[#ff6680] bg-[#ff375f]/10 hover:bg-[#ff375f]/20 rounded-lg py-1.5 px-3 transition-colors",children:"Delete"})]})]})]},t.id))}),k&&e.jsx("div",{className:"fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto",children:e.jsxs("div",{className:"bg-dark-surface rounded-2xl border border-dark-border w-full max-w-5xl my-8",children:[e.jsxs("div",{className:"p-6 border-b border-dark-border flex items-center justify-between",children:[e.jsx("h2",{className:"text-lg font-bold text-white",children:l?"Edit Template":"Create Email Template"}),e.jsx("button",{onClick:h,className:"text-[#636366] hover:text-white text-lg",children:"×"})]}),e.jsxs("div",{className:"p-6 grid grid-cols-1 lg:grid-cols-2 gap-6",children:[e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"Template Name"}),e.jsx("input",{type:"text",value:r.name,onChange:t=>s(a=>({...a,name:t.target.value})),placeholder:"e.g. Monthly Newsletter",className:"w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"})]}),!l&&e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"Start from Preset"}),e.jsx("div",{className:"flex gap-2",children:Y.map(t=>e.jsx("button",{type:"button",onClick:()=>s(a=>({...a,html_body:t.value,subject:t.subject||a.subject,category:t.category})),className:`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${r.html_body===t.value?"bg-primary-600 text-white border-primary-600":"bg-dark-surface2 text-t-secondary border-dark-border hover:border-primary-500"}`,children:t.label},t.label))})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"Subject Line"}),e.jsx("input",{type:"text",value:r.subject,onChange:t=>s(a=>({...a,subject:t.target.value})),placeholder:"e.g. {{first_name}}, you have {{points_balance}} points!",className:"w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"Category"}),e.jsx("select",{value:r.category,onChange:t=>s(a=>({...a,category:t.target.value})),className:"w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500",children:q.map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))})]})]}),e.jsxs("div",{children:[e.jsxs("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-2",children:["Insert Merge Tag ",e.jsx("span",{className:"font-normal text-[#636366]",children:"(click to insert at cursor)"})]}),e.jsx("div",{className:"flex flex-wrap gap-1.5",children:Object.entries(A).map(([t,a])=>e.jsx("button",{type:"button",onClick:()=>L(t),title:a,className:"px-2.5 py-1 rounded-lg text-xs font-mono bg-primary-500/10 text-primary-400 hover:bg-primary-500/25 border border-primary-500/20 transition-colors",children:t},t))})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"HTML Body"}),e.jsx("textarea",{ref:y,value:r.html_body,onChange:t=>s(a=>({...a,html_body:t.target.value})),rows:20,spellCheck:!1,className:"w-full bg-[#111] border border-dark-border rounded-lg px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"})]})]}),e.jsxs("div",{className:"flex flex-col",children:[e.jsx("label",{className:"block text-sm font-semibold text-[#a0a0a0] mb-1",children:"Live Preview"}),e.jsx("div",{className:"flex-1 bg-white rounded-lg overflow-hidden border border-dark-border min-h-[400px]",children:e.jsx("iframe",{srcDoc:r.html_body,title:"Preview",className:"w-full h-full min-h-[400px]",sandbox:""})}),e.jsx("p",{className:"text-[10px] text-[#636366] mt-2",children:'Merge tags shown as-is in preview. Use "Preview with Data" after saving to see rendered output.'})]})]}),e.jsxs("div",{className:"p-6 border-t border-dark-border flex gap-3",children:[e.jsx("button",{onClick:h,className:"flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors",children:"Cancel"}),e.jsx("button",{onClick:()=>f.mutate(r),disabled:!r.name||!r.subject||!r.html_body||f.isPending,className:"flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",children:f.isPending?"Saving...":l?"Update Template":"Create Template"})]})]})}),_&&e.jsx("div",{className:"fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-dark-surface rounded-2xl border border-dark-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col",children:[e.jsxs("div",{className:"p-5 border-b border-dark-border flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-lg font-bold text-white",children:"Email Preview"}),e.jsxs("p",{className:"text-xs text-[#636366] mt-0.5",children:["Subject: ",T]})]}),e.jsx("button",{onClick:()=>u(!1),className:"text-[#636366] hover:text-white text-lg",children:"×"})]}),e.jsx("div",{className:"flex-1 overflow-auto bg-white",children:e.jsx("iframe",{srcDoc:C,title:"Rendered Preview",className:"w-full min-h-[500px] h-full",sandbox:""})})]})})]})}export{V as EmailTemplates};
