import type { Email } from './types';

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

export const sampleEmails: Email[] = [
  { id:'1', sender:'The Daily Brief', address:'news@dailybrief.example', subject:'Markets, rates and five things to know', preview:'Your weekday briefing is ready...', date:daysAgo(1), size:184000, read:false, starred:false, attachment:false, category:'Updates', trashed:false },
  { id:'2', sender:'The Daily Brief', address:'news@dailybrief.example', subject:'The week in review', preview:'The stories that shaped your week...', date:daysAgo(8), size:201000, read:true, starred:false, attachment:false, category:'Updates', trashed:false },
  { id:'3', sender:'The Daily Brief', address:'news@dailybrief.example', subject:'Energy prices explained', preview:'A closer look at this week’s move...', date:daysAgo(31), size:176000, read:true, starred:false, attachment:false, category:'Updates', trashed:false },
  { id:'4', sender:'ShopDrop', address:'offers@shopdrop.example', subject:'Last chance: 40% off', preview:'This sale disappears at midnight...', date:daysAgo(2), size:824000, read:false, starred:false, attachment:false, category:'Promotions', trashed:false },
  { id:'5', sender:'ShopDrop', address:'offers@shopdrop.example', subject:'Something in your cart?', preview:'The picks you left behind...', date:daysAgo(13), size:693000, read:true, starred:false, attachment:false, category:'Promotions', trashed:false },
  { id:'6', sender:'ShopDrop', address:'offers@shopdrop.example', subject:'New arrivals for fall', preview:'Fresh colors and layers...', date:daysAgo(62), size:921000, read:true, starred:false, attachment:false, category:'Promotions', trashed:false },
  { id:'7', sender:'MyBank Alerts', address:'alerts@mybank.example', subject:'Your statement is ready', preview:'Your monthly statement is now available.', date:daysAgo(3), size:54000, read:false, starred:true, attachment:true, category:'Receipts', trashed:false },
  { id:'8', sender:'MyBank Alerts', address:'alerts@mybank.example', subject:'Deposit confirmation', preview:'A deposit was posted to your account.', date:daysAgo(25), size:42000, read:true, starred:false, attachment:false, category:'Primary', trashed:false },
  { id:'9', sender:'Family', address:'mom@family.example', subject:'Sunday dinner photos', preview:'Here are the pictures from Sunday.', date:daysAgo(5), size:3400000, read:true, starred:true, attachment:true, category:'Primary', trashed:false },
  { id:'10', sender:'CloudBox', address:'hello@cloudbox.example', subject:'Your monthly receipt', preview:'Thanks for your payment.', date:daysAgo(7), size:78000, read:true, starred:false, attachment:true, category:'Receipts', trashed:false },
  { id:'11', sender:'CloudBox', address:'hello@cloudbox.example', subject:'Your monthly receipt', preview:'Thanks for your payment.', date:daysAgo(38), size:81000, read:true, starred:false, attachment:true, category:'Receipts', trashed:false },
  { id:'12', sender:'CloudBox', address:'hello@cloudbox.example', subject:'Your monthly receipt', preview:'Thanks for your payment.', date:daysAgo(69), size:76000, read:true, starred:false, attachment:true, category:'Receipts', trashed:false },
  { id:'13', sender:'LearnLoop', address:'updates@learnloop.example', subject:'Your weekly learning digest', preview:'You completed three lessons this week.', date:daysAgo(4), size:248000, read:false, starred:false, attachment:false, category:'Updates', trashed:false },
  { id:'14', sender:'LearnLoop', address:'updates@learnloop.example', subject:'New course recommendations', preview:'Courses picked for your goals.', date:daysAgo(45), size:389000, read:true, starred:false, attachment:false, category:'Promotions', trashed:false },
  { id:'15', sender:'Travel Club', address:'deals@travelclub.example', subject:'Weekend fares from Philadelphia', preview:'Explore member-only fares.', date:daysAgo(6), size:1100000, read:false, starred:false, attachment:false, category:'Promotions', trashed:false },
  { id:'16', sender:'Travel Club', address:'deals@travelclub.example', subject:'Spring travel guide', preview:'Plan your next getaway.', date:daysAgo(214), size:970000, read:true, starred:false, attachment:true, category:'Promotions', trashed:false }
];
