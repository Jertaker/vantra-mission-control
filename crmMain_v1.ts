// crmApp — VANTRA CRM mobile-first web client
// Served as HTML; talks to crmApi (same PIN/session system as Mission Control).
// PRINCIPLE: PHONE WORKS ALONE. No agent runtime required.


import { createClientFromRequest } from "https://esm.sh/@base44/sdk@0.8.31";

// ---------------- server-side rendering (works with ZERO JavaScript) ----------------
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b: number) => b.toString(16).padStart(2, "0")).join("");
}
function escSrv(x: unknown): string {
  return String(x == null ? "" : x).replace(/[&<>"']/g, function (c: string) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c] || c;
  });
}
// MULTI-NUMBER PHONE FIELD FIX (Sept 14, 2026): some contacts carry more than one
// number in the phone field, e.g. "(478)231-5925 / (478)867-3929". The old code did
// phone.replace(/[^0-9+]/g,"") on the WHOLE string, which strips the "/" separator too
// and mashes every number's digits into one 20+ digit tel: link that can't be dialed.
// Fix: split on common separators first, then build one tel: link PER number so each
// is individually clickable, still displayed together on one line.
function splitPhoneNumbers(phone: string): string[] {
  return String(phone || "")
    .split(/\s*(?:\/|,|;|&| and )\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
function phoneLinksHtml(phone: string, linkColor: string): string {
  const parts = splitPhoneNumbers(phone);
  if (!parts.length) return "";
  return parts
    .map((p) => {
      const digits = p.replace(/[^0-9+]/g, "");
      return '<a href="tel:' + escSrv(digits) + '" style="color:' + linkColor + ';text-decoration:none">&#128222; ' + escSrv(p) + "</a>";
    })
    .join(" &#183; ");
}
// ---------------- PER-NUMBER OUTCOME TRACKING (Sept 14, 2026) ----------------
// Some contacts carry 2-4 numbers. Boss wants ONE outcome logged PER NUMBER before the
// contact counts as done for the day, so he never forgets what happened on the number
// he called 3 taps ago. numberOutcomes stores a JSON map { numberIndex: lastDate }.
function numOutcomesMap(c: any): Record<string, string> {
  try {
    const m = JSON.parse(String((c && c.numberOutcomes) || "") || "{}");
    return m && typeof m === "object" ? m : {};
  } catch { return {}; }
}
function numbersDoneToday(c: any, todayStr: string): { total: number; done: number } {
  const parts = splitPhoneNumbers(String(c.phone || ""));
  if (parts.length <= 1) {
    const done = String(c.lastInteractionDate || "") === todayStr && !!String(c.notes || "").trim();
    return { total: 1, done: done ? 1 : 0 };
  }
  const map = numOutcomesMap(c);
  let done = 0;
  for (let i = 0; i < parts.length; i++) if (String(map[String(i)] || "") === todayStr) done++;
  return { total: parts.length, done };
}
// ORDINAL NUMBER LABELS (Boss's format, Sept 14 2026): notes for multi-number contacts
// use "(First number):", "(Second number):" etc. as the prefix -- NOT the raw phone
// digits. Matches Boss's own handwritten Sheet convention exactly (row 4104 example).
const ORDINAL_WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
function ordinalNumberLabel(i: number): string {
  const w = ORDINAL_WORDS[i] || (i + 1) + "th";
  return "(" + w + " number)";
}
const AREA_CODE_CITY: Record<string, string> = {
  "201":"Jersey City, NJ",
  "202":"Washington, DC",
  "203":"Bridgeport, CT",
  "205":"Birmingham, AL",
  "206":"Seattle, WA",
  "207":"Portland, ME",
  "208":"Boise, ID",
  "209":"Stockton, CA",
  "210":"San Antonio, TX",
  "212":"Manhattan, NY",
  "213":"Los Angeles, CA",
  "214":"Dallas, TX",
  "215":"Philadelphia, PA",
  "216":"Cleveland, OH",
  "217":"Springfield, IL",
  "218":"Duluth, MN",
  "219":"Gary, IN",
  "224":"Evanston, IL",
  "225":"Baton Rouge, LA",
  "226":"London, ON",
  "227":"Detroit, MI",
  "228":"Gulfport, MS",
  "229":"Albany, GA",
  "231":"Traverse City, MI",
  "234":"Akron, OH",
  "239":"Fort Myers, FL",
  "240":"Silver Spring, MD",
  "248":"Southfield, MI",
  "251":"Mobile, AL",
  "252":"Greenville, NC",
  "253":"Tacoma, WA",
  "254":"Waco, TX",
  "260":"Fort Wayne, IN",
  "262":"Kenosha, WI",
  "267":"Philadelphia, PA",
  "270":"Bowling Green, KY",
  "272":"Scranton, PA",
  "276":"Bristol, VA",
  "281":"Houston, TX",
  "283":"Cincinnati, OH",
  "289":"Toronto, ON",
  "301":"Silver Spring, MD",
  "302":"Wilmington, DE",
  "303":"Denver, CO",
  "304":"Charleston, WV",
  "305":"Miami, FL",
  "306":"Regina, SK",
  "307":"Cheyenne, WY",
  "308":"North Platte, NE",
  "309":"Peoria, IL",
  "310":"Los Angeles, CA",
  "312":"Chicago, IL",
  "313":"Detroit, MI",
  "314":"St. Louis, MO",
  "315":"Syracuse, NY",
  "316":"Wichita, KS",
  "317":"Indianapolis, IN",
  "318":"Shreveport, LA",
  "319":"Cedar Rapids, IA",
  "320":"St. Cloud, MN",
  "321":"Orlando, FL",
  "323":"Los Angeles, CA",
  "325":"Abilene, TX",
  "330":"Akron, OH",
  "331":"Aurora, IL",
  "334":"Montgomery, AL",
  "336":"Greensboro, NC",
  "337":"Lafayette, LA",
  "339":"Boston, MA",
  "340":"US Virgin Islands",
  "343":"Ottawa, ON",
  "346":"Houston, TX",
  "347":"Brooklyn, NY",
  "351":"Lowell, MA",
  "352":"Gainesville, FL",
  "360":"Olympia, WA",
  "361":"Corpus Christi, TX",
  "364":"Bowling Green, KY",
  "365":"Toronto, ON",
  "380":"Columbus, OH",
  "385":"Salt Lake City, UT",
  "386":"Daytona Beach, FL",
  "401":"Providence, RI",
  "402":"Omaha, NE",
  "403":"Calgary, AB",
  "404":"Atlanta, GA",
  "405":"Oklahoma City, OK",
  "406":"Billings, MT",
  "407":"Orlando, FL",
  "408":"San Jose, CA",
  "409":"Beaumont, TX",
  "410":"Baltimore, MD",
  "412":"Pittsburgh, PA",
  "413":"Springfield, MA",
  "414":"Milwaukee, WI",
  "415":"San Francisco, CA",
  "416":"Toronto, ON",
  "417":"Springfield, MO",
  "418":"Quebec City, QC",
  "419":"Toledo, OH",
  "423":"Chattanooga, TN",
  "424":"Los Angeles, CA",
  "425":"Bellevue, WA",
  "430":"Tyler, TX",
  "431":"Winnipeg, MB",
  "432":"Midland, TX",
  "434":"Lynchburg, VA",
  "435":"St. George, UT",
  "437":"Toronto, ON",
  "438":"Montreal, QC",
  "440":"Cleveland, OH",
  "443":"Baltimore, MD",
  "445":"Philadelphia, PA",
  "447":"Springfield, IL",
  "458":"Eugene, OR",
  "463":"Indianapolis, IN",
  "469":"Dallas, TX",
  "470":"Atlanta, GA",
  "475":"Bridgeport, CT",
  "478":"Macon, GA",
  "479":"Fayetteville, AR",
  "480":"Scottsdale, AZ",
  "484":"Allentown, PA",
  "501":"Little Rock, AR",
  "502":"Louisville, KY",
  "503":"Portland, OR",
  "504":"New Orleans, LA",
  "505":"Albuquerque, NM",
  "507":"Rochester, MN",
  "508":"Worcester, MA",
  "509":"Spokane, WA",
  "510":"Oakland, CA",
  "512":"Austin, TX",
  "513":"Cincinnati, OH",
  "515":"Des Moines, IA",
  "516":"Long Island, NY",
  "517":"Lansing, MI",
  "518":"Albany, NY",
  "519":"London, ON",
  "520":"Tucson, AZ",
  "530":"Redding, CA",
  "531":"Omaha, NE",
  "534":"Eau Claire, WI",
  "539":"Tulsa, OK",
  "540":"Roanoke, VA",
  "541":"Eugene, OR",
  "551":"Jersey City, NJ",
  "559":"Fresno, CA",
  "561":"West Palm Beach, FL",
  "562":"Long Beach, CA",
  "563":"Davenport, IA",
  "567":"Toledo, OH",
  "570":"Scranton, PA",
  "571":"Arlington, VA",
  "573":"Columbia, MO",
  "574":"South Bend, IN",
  "575":"Las Cruces, NM",
  "580":"Lawton, OK",
  "581":"Quebec City, QC",
  "585":"Rochester, NY",
  "586":"Warren, MI",
  "587":"Calgary, AB",
  "601":"Jackson, MS",
  "602":"Phoenix, AZ",
  "603":"Manchester, NH",
  "605":"Sioux Falls, SD",
  "606":"Ashland, KY",
  "607":"Binghamton, NY",
  "608":"Madison, WI",
  "609":"Trenton, NJ",
  "610":"Allentown, PA",
  "612":"Minneapolis, MN",
  "613":"Ottawa, ON",
  "614":"Columbus, OH",
  "615":"Nashville, TN",
  "616":"Grand Rapids, MI",
  "617":"Boston, MA",
  "618":"Belleville, IL",
  "619":"San Diego, CA",
  "620":"Dodge City, KS",
  "623":"Phoenix, AZ",
  "626":"Pasadena, CA",
  "628":"San Francisco, CA",
  "629":"Nashville, TN",
  "630":"Naperville, IL",
  "631":"Long Island, NY",
  "636":"St. Charles, MO",
  "639":"Saskatoon, SK",
  "641":"Mason City, IA",
  "646":"Manhattan, NY",
  "647":"Toronto, ON",
  "649":"Turks and Caicos",
  "650":"San Mateo, CA",
  "651":"St. Paul, MN",
  "657":"Anaheim, CA",
  "660":"Sedalia, MO",
  "661":"Bakersfield, CA",
  "662":"Tupelo, MS",
  "667":"Baltimore, MD",
  "669":"San Jose, CA",
  "678":"Atlanta, GA",
  "681":"Charleston, WV",
  "682":"Fort Worth, TX",
  "701":"Fargo, ND",
  "702":"Las Vegas, NV",
  "703":"Arlington, VA",
  "704":"Charlotte, NC",
  "705":"Sudbury, ON",
  "706":"Columbus, GA",
  "707":"Santa Rosa, CA",
  "708":"Cicero, IL",
  "709":"St. John's, NL",
  "712":"Sioux City, IA",
  "713":"Houston, TX",
  "714":"Anaheim, CA",
  "715":"Eau Claire, WI",
  "716":"Buffalo, NY",
  "717":"Harrisburg, PA",
  "718":"Brooklyn, NY",
  "719":"Colorado Springs, CO",
  "720":"Denver, CO",
  "721":"Sint Maarten",
  "724":"Pittsburgh, PA",
  "725":"Las Vegas, NV",
  "727":"St. Petersburg, FL",
  "731":"Jackson, TN",
  "732":"New Brunswick, NJ",
  "734":"Ann Arbor, MI",
  "737":"Austin, TX",
  "740":"Zanesville, OH",
  "747":"Los Angeles, CA",
  "754":"Fort Lauderdale, FL",
  "757":"Norfolk, VA",
  "758":"St. Lucia",
  "760":"Oceanside, CA",
  "762":"Augusta, GA",
  "763":"Minneapolis, MN",
  "765":"Muncie, IN",
  "770":"Atlanta, GA",
  "772":"Port St. Lucie, FL",
  "773":"Chicago, IL",
  "774":"Worcester, MA",
  "775":"Reno, NV",
  "778":"Vancouver, BC",
  "779":"Rockford, IL",
  "780":"Edmonton, AB",
  "781":"Boston, MA",
  "785":"Topeka, KS",
  "786":"Miami, FL",
  "787":"San Juan, PR",
  "801":"Salt Lake City, UT",
  "802":"Burlington, VT",
  "803":"Columbia, SC",
  "804":"Richmond, VA",
  "805":"Ventura, CA",
  "806":"Lubbock, TX",
  "807":"Thunder Bay, ON",
  "808":"Honolulu, HI",
  "810":"Flint, MI",
  "812":"Evansville, IN",
  "813":"Tampa, FL",
  "814":"Erie, PA",
  "815":"Rockford, IL",
  "816":"Kansas City, MO",
  "817":"Fort Worth, TX",
  "818":"Los Angeles, CA",
  "819":"Gatineau, QC",
  "828":"Asheville, NC",
  "830":"New Braunfels, TX",
  "831":"Salinas, CA",
  "832":"Houston, TX",
  "843":"Charleston, SC",
  "845":"Poughkeepsie, NY",
  "847":"Northbrook, IL",
  "848":"New Brunswick, NJ",
  "850":"Tallahassee, FL",
  "854":"Charleston, SC",
  "856":"Camden, NJ",
  "857":"Boston, MA",
  "858":"San Diego, CA",
  "859":"Lexington, KY",
  "860":"Hartford, CT",
  "862":"Newark, NJ",
  "863":"Lakeland, FL",
  "864":"Greenville, SC",
  "865":"Knoxville, TN",
  "870":"Jonesboro, AR",
  "872":"Chicago, IL",
  "873":"Gatineau, QC",
  "878":"Pittsburgh, PA",
  "901":"Memphis, TN",
  "902":"Halifax, NS",
  "903":"Tyler, TX",
  "904":"Jacksonville, FL",
  "906":"Marquette, MI",
  "907":"Anchorage, AK",
  "908":"Elizabeth, NJ",
  "909":"San Bernardino, CA",
  "910":"Fayetteville, NC",
  "912":"Savannah, GA",
  "913":"Overland Park, KS",
  "914":"Yonkers, NY",
  "915":"El Paso, TX",
  "916":"Sacramento, CA",
  "917":"New York, NY",
  "918":"Tulsa, OK",
  "919":"Raleigh, NC",
  "920":"Green Bay, WI",
  "925":"Concord, CA",
  "928":"Flagstaff, AZ",
  "929":"Brooklyn, NY",
  "930":"Evansville, IN",
  "931":"Clarksville, TN",
  "936":"Conroe, TX",
  "937":"Dayton, OH",
  "938":"Huntsville, AL",
  "939":"San Juan, PR",
  "940":"Denton, TX",
  "941":"Sarasota, FL",
  "947":"Southfield, MI",
  "949":"Irvine, CA",
  "951":"Riverside, CA",
  "952":"Minneapolis, MN",
  "954":"Fort Lauderdale, FL",
  "956":"Laredo, TX",
  "959":"Hartford, CT",
  "970":"Fort Collins, CO",
  "971":"Portland, OR",
  "972":"Dallas, TX",
  "973":"Newark, NJ",
  "978":"Lowell, MA",
  "979":"College Station, TX",
  "980":"Charlotte, NC",
  "984":"Raleigh, NC",
  "985":"Houma, LA",
  "989":"Saginaw, MI",
};

const MALE_FIRST_NAMES = new Set(["aaron","adam","alan","albert","alexander","alfredo","andrew","angel","anthony","antonio","arthur","austin","benjamin","billy","blake","bobby","bradley","brandon","brett","brian","brock","bruce","bryan","bryson","buck","butters","caleb","calvin","cam","cameron","carl","carlos","chad","charles","charlie","chase","chef","chris","christian","christopher","chuck","clark","clay","clint","cody","cole","colin","connor","corey","craig","dale","daniel","dave","david","dean","dennis","derek","donald","douglas","drew","drone","dustin","dylan","edward","edwin","elijah","elliot","enrique","eric","ethan","eugene","evan","felix","fernando","finn","francisco","frank","gabriel","gary","gavin","george","gerald","gordon","grant","gregory","guy","hank","harold","harrison","hayden","henry","howard","hudson","hugh","hunter","ian","isaac","isaiah","jack","jacob","jaime","james","jason","jasper","jax","jeffrey","jeremy","jerry","jesse","jesus","jett","joe","john","johnny","jonathan","jordan","jorge","jose","joseph","joshua","juan","jude","julian","justin","karl","keith","kenneth","kenny","kevin","kian","knox","kyle","lance","larry","lawrence","lee","leo","leon","leroy","levi","lincoln","lloyd","logan","louis","luis","luke","manuel","marco","marcus","mario","marion","mark","marshall","martin","mason","matthew","max","maxwell","maynard","melvin","michael","miguel","mike","milo","myron","nathan","nathaniel","neil","nicholas","noah","nolan","norman","omar","orlando","oscar","otis","owen","patrick","paul","perry","peter","philip","porter","quentin","quinn","rafael","ralph","randy","raymond","reed","reese","reggie","reid","rex","rhett","ricardo","richard","robert","rocco","rodney","roger","roland","ronald","ross","roy","rudy","russell","ryan","sam","sammy","samuel","scot","scott","sean","shane","shawn","sheldon","sidney","simon","spencer","stan","stanley","stephen","sterling","steve","steven","stewart","tanner","terry","theo","theodore","thomas","thurston","timothy","tobias","todd","tony","travis","trevor","tristan","troy","tucker","tyler","vernon","victor","vincent","virgil","wade","walker","wallace","walter","ward","warren","wayne","wendell","wesley","william","willie","winston","wolf","woodrow","wyatt","xavier","zachary","zane","zeke"]);
const FEMALE_FIRST_NAMES = new Set(["abigail","alexis","alice","alyssa","amanda","amber","amy","andrea","angela","ann","anna","ashley","ashlyn","barbara","betty","beverly","brenda","breonna","brittany","brooke","caitlin","camille","carol","carolina","caroline","carolyn","carrie","casey","cassie","catherine","charlotte","chelsea","cheryl","chloe","christina","christine","claire","courtney","cynthia","daisy","danielle","deborah","debra","delilah","denise","diana","diane","donna","doris","eleanor","eliza","elizabeth","ella","ellie","emily","emma","erica","erika","erin","evelyn","faith","felicia","fiona","flora","florence","frances","gabrielle","gemma","georgia","gina","gloria","grace","hannah","hazel","heather","heidi","helen","holly","ingrid","irene","isabel","isabella","ivy","jacqueline","jade","janet","janice","jasmine","jean","jenna","jennifer","jessica","joan","jocelyn","jordyn","joy","joyce","judith","judy","julia","julie","juliet","june","kaitlyn","karen","kate","katherine","kathleen","kathryn","kathy","katie","kayla","kayleigh","kelly","kendra","kiara","kimberly","kylie","lacey","larissa","laura","lauren","leah","leslie","lily","linda","lindsay","lindsey","lisa","lori","lucy","lydia","mackenzie","madison","maggie","makayla","mallory","margaret","margarita","maria","marilyn","marissa","martha","mary","mckenna","megan","melissa","meredith","mia","michelle","mila","miranda","mollie","monica","morgan","nancy","naomi","natalie","nicole","nina","nora","olivia","paige","pamela","patricia","paula","peyton","phoebe","piper","priscilla","rachel","raven","rebecca","regina","renee","rhonda","riley","rita","rodcw","rosa","rose","ruby","ruth","sadie","sage","sally","samantha","sandra","sara","sarah","savannah","scarlett","serena","shannon","sharon","shelby","shirley","sierra","skylar","sloane","sophia","sophie","stacy","stephanie","summer","susan","sydney","tara","tatum","taylor","teresa","tessa","theresa","tiffany","valerie","vanessa","vera","veronica","victoria","violet","virginia","whitney","willow","wren","yolanda","yvonne","zoe"]);

// AREA-CODE LOCATION GUESS (Sept 13, 2026): Boss manually reads the area code and
// jots "Referral / Possibly lives in City, ST" into the Sheet's "How you know" column
// every time he calls someone. This automates that lookup — computed once, the first
// time an outcome is logged for a contact, and only if relationshipType doesn't
// already carry a location guess (never overwrites a manual note).
// Local numbers (Boss's own home area) don't need a "possibly lives in" note — it's
// assumed local. Add more codes here if Boss's calling area covers other overlays.
const LOCAL_AREA_CODES = new Set(["716"]);
function areaCodeOf(phone: string): string {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  return digits.length === 11 && digits[0] === "1" ? digits.substring(1, 4) : digits.substring(0, 3);
}
function guessLocationFromPhone(phone: string): string {
  const ac = areaCodeOf(phone);
  if (LOCAL_AREA_CODES.has(ac)) return ""; // local — no location note needed
  return AREA_CODE_CITY[ac] || "";
}
// UNCOMMON NAME GENDER NOTES (Boss directive, Sept 14 2026): for first names that
// aren't obviously gendered to a typical US caller, add "<Name> is a male/female name"
// to relationshipType -- same reactive-on-call pattern as the location guess. Names
// already in MALE_FIRST_NAMES/FEMALE_FIRST_NAMES are common enough to skip (no note
// needed); this is a SEPARATE, smaller list of less-common names, used ONLY for the note.
const UNCOMMON_FEMALE_NAMES = new Set(["chantel","chantal","shanice","precious","unique","treasure","nevaeh","kiana","tanisha","latoya","shaniqua","aaliyah","imani","destiny","mercedes","journey","promise","essence","princess","egypt","tierra","keisha","laquita","shanae","tamika","ebony","tiara","jaylah","nakia","alexus","aniyah","kailyn","kamryn","harmony","serenity","rylee","kiera","kyra","nyla","zaria","aja","asia","chyna","dallas","reagan","addison","avery","emerson","dakota","payton","peyton","quinn","sage","skylar","sloane","ariel","alexa","alexia","alanis","amaya","amiyah","aniya","ashanti","azaria","breanna","briana","brianna","cheyenne","daniela","deja","deshaun","diamond","eboni","essie","gianna","jada","jaida","jayla","kenya","kiona","lakeisha","laurie","leilani","makenna","malaysia","mariah","mikayla","montana","nia","nicola","nyasia","rihanna","rosalind","rosalyn","sabrina","selena","shakira","shantel","shantelle","tia","tianna","tiana","yesenia","yaritza","zoey","zaniyah"]);
const UNCOMMON_MALE_NAMES = new Set(["deshawn","dashawn","deandre","jamal","malik","terrell","marquis","darnell","tyrone","rashad","cornelius","jermaine","lamont","keon","jaquan","tavon","andre","dante","montrell","davion","jaylen","jaylin","keyshawn","jaheim","kaden","brayden","jaxon","gunner","colt","maddox","kaiden","ryder","chance","davonte","dequan","jamar","jaron","javon","jayceon","kobe","kwame","lonzo","marcell","maurice","quincy","rayshawn","shaquille","tremaine","tyshawn","zion","amir","amare","apollo","axl","boston","chase","denver","dune","emory","fletcher","gage","harlem","haven","jagger","kingston","legend","memphis","phoenix","remy","rome","sincere","stone","tatum","tobin","truett","wilder"]);
function uncommonNameGenderNote(firstName: string, fullName: string): string {
  const raw = String(firstName || "").trim() || String(fullName || "").trim().split(/\s+/)[0] || "";
  const n = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return "";
  if (MALE_FIRST_NAMES.has(n) || FEMALE_FIRST_NAMES.has(n)) return ""; // common enough, no note needed
  if (UNCOMMON_FEMALE_NAMES.has(n)) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() + " is a female name";
  if (UNCOMMON_MALE_NAMES.has(n)) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() + " is a male name";
  return "";
}
function withGenderNote(relationshipType: string, firstName: string, fullName: string): string {
  const rt = String(relationshipType || "").trim();
  if (/ is a (male|female) name/i.test(rt)) return rt; // already noted
  const note = uncommonNameGenderNote(firstName, fullName);
  if (!note) return rt;
  const base = rt || "Referral";
  return base + " / " + note;
}
function withLocationGuess(relationshipType: string, phone: string): string {
  const rt = String(relationshipType || "").trim();
  if (/lives in/i.test(rt)) return rt; // already has a guess (manual or auto) — don't touch it
  const loc = guessLocationFromPhone(phone);
  if (!loc) return rt;
  const base = rt || "Referral";
  return base + " / Possibly lives in " + loc;
}
// GENDER-BASED CALLER ASSIGNMENT (Sept 13, 2026): Brett works the male-presumed
// names, Lindsay works the female-presumed names, on their own time between Boss's
// calls. Column A carries that assignment. Computed once — only when column A/
// assignedCaller is still blank — and never overwrites a manual assignment.
function guessCallerFromName(firstName: string, fullName: string): string {
  const raw = String(firstName || "").trim() || String(fullName || "").trim().split(/\s+/)[0] || "";
  const n = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return "";
  if (FEMALE_FIRST_NAMES.has(n)) return "Lindsay";
  if (MALE_FIRST_NAMES.has(n)) return "Brett";
  return ""; // unknown/ambiguous — leave blank for manual assignment, same as today
}

const TIER_RANK: Record<string, number> = { due_commitment: 0, fresh_never_contacted: 1, active_pipeline: 2, re_engagement: 3, stale_dead: 4 };
const TIER_LABEL: Record<string, string> = { due_commitment: "DUE COMMITMENT", fresh_never_contacted: "FRESH", active_pipeline: "ACTIVE", re_engagement: "RE-ENGAGE", stale_dead: "STALE" };

function staticForm(actionUrl: string, kind: "setup" | "login", err: string): string {
  const act = actionUrl ? ' action="' + actionUrl + '"' : '';
  const errBox = err ? '<div style="background:#7f1d1d;color:#fecaca;padding:10px;border-radius:8px;margin-bottom:10px;font-size:14px">' + escSrv(err) + "</div>" : "";
  if (kind === "setup") {
    return errBox
      + '<form method="GET" action="' + actionUrl + '" style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:14px;margin-bottom:14px">'
      + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px">STEP 1 OF 1 — LOCK YOUR CRM</div>'
      + '<div style="font-size:16px;font-weight:bold;margin-bottom:10px">Choose your PIN (6+ characters). It locks this CRM back down.</div>'
      + '<input type="hidden" name="op" value="setupPin"><input type="hidden" name="fmt" value="html"><input type="hidden" name="deviceLabel" value="form-setpin">'
      + '<input type="password" name="pin" placeholder="Choose your PIN" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">'
      + '<input type="password" name="confirmPin" placeholder="Repeat your PIN" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:10px">'
      + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">SET PIN &amp; FINISH</button>'
      + "</form>";
  }
  return errBox
    + '<form method="GET"' + act + ' style="background:#15151f;border:1px solid #262636;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:16px;font-weight:bold;margin-bottom:10px">Enter your PIN to open your CRM</div>'
    + '<input type="hidden" name="op" value="login"><input type="hidden" name="fmt" value="html">'
    + '<input type="password" name="pin" placeholder="PIN" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:10px">'
    + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">UNLOCK</button>'
    + "</form>";
}

function staticList(contacts: any[]): string {
  const sorted = contacts.slice().sort(function (a: any, b: any) {
    const ra = TIER_RANK[a.contactStatus] != null ? TIER_RANK[a.contactStatus] : 5;
    const rb = TIER_RANK[b.contactStatus] != null ? TIER_RANK[b.contactStatus] : 5;
    if (ra !== rb) return ra - rb;
    const pa = typeof a.priorityScore === "number" ? a.priorityScore : 0;
    const pb = typeof b.priorityScore === "number" ? b.priorityScore : 0;
    if (pa !== pb) return pb - pa;
    return String(a.lastInteractionDate || "").localeCompare(String(b.lastInteractionDate || ""));
  });
  let h = '<div style="font-size:12px;color:#8b8b9e;margin:2px 0 10px">TODAY&#8217;S PRIORITY CALL LIST &#183; TOP ' + Math.min(20, sorted.length) + ' &#183; TAP A NUMBER TO CALL</div>';
  const top = sorted.slice(0, 20);
  if (!top.length) return h + '<div style="color:#8b8b9e">No contacts yet.</div>';
  for (const c of top) {
    const tier = String(c.contactStatus || "");
    const lbl = TIER_LABEL[tier] || "CONTACT";
    const phone = String(c.phone || "");
    h += '<div style="background:#15151f;border:1px solid #262636;border-radius:12px;padding:12px;margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:16px;font-weight:bold">' + escSrv(c.fullName || c.businessName || "(unnamed)") + '</div><div style="font-size:10px;font-weight:bold;color:#f5d142;border:1px solid #f5d142;border-radius:99px;padding:2px 8px">' + lbl + "</div></div>"
      + (phone ? '<div style="margin-top:6px;font-size:15px">' + phoneLinksHtml(phone, "#4ade80") + "</div>" : "")
      + (c.nextAction ? '<div style="margin-top:6px;color:#f5d142;font-size:13px">&#10148; ' + escSrv(c.nextAction) + "</div>" : "")
      + (c.nextFollowUpDate ? '<div style="margin-top:4px;color:#8b8b9e;font-size:12px">Follow up: ' + escSrv(c.nextFollowUpDate) + "</div>" : "")
      + '<div style="margin-top:8px"><a href="?log=' + escSrv(c.id) + '" style="color:#60a5fa;font-size:12px;font-weight:bold;text-decoration:none">&#9998; LOG OUTCOME &#8594;</a></div>'
      + "</div>";
  }
  return h;
}



const ENGINE_URL = "https://base44.app/api/apps/6a9224f8c29c628aa348d1ac/functions/dailyActionEngine";

// SOP (VANTRA Intake & CRM SOP, Sept 2026): business rules live in ONE place — the
// Daily Action Engine. The server-rendered view must use the engine's queue, not a
// duplicated sort. Internal call mints a 2-minute ephemeral session (no secrets in
// code) and deletes it immediately.
async function getEngineQueue(db: any, size: number): Promise<{ queue: any[]; stats: any; generatedAt: string } | null> {
  try {
    const tok = "crm_" + crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 120000).toISOString();
    const sess = await db.entities.McSession.create({ token: await sha256hex(tok), deviceLabel: "static-render-internal", createdAt: now, expiresAt: expires, lastSeenAt: now });
    const szN = Math.max(1, Math.min(100, Math.round(size || 10)));
    const r = await fetch(ENGINE_URL, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok }, body: JSON.stringify({ size: szN }) });
    try { await db.entities.McSession.delete(sess.id); } catch { /* non-fatal */ }
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !Array.isArray(j.dailyQueue)) return null;
    return { queue: j.dailyQueue, stats: j.stats || {}, generatedAt: j.generatedAt || now };
  } catch { return null; }
}

// SOP-accurate queue render (no JavaScript): due commitments -> fresh (ascending
// source-row order) -> active -> re-engage; stale excluded; channel advice shown.
const QTIER_LABEL: Record<string, string> = { due_commitment: "DUE COMMITMENT", fresh_never_contacted: "FRESH", active_pipeline: "ACTIVE", re_engagement: "RE-ENGAGE", stale_dead: "STALE" };
const QTIER_COLOR: Record<string, string> = { due_commitment: "#f87171", fresh_never_contacted: "#4ade80", active_pipeline: "#60a5fa", re_engagement: "#fbbf24", stale_dead: "#8b8b9e" };
function staticSizeForm(current: number): string {
  return '<form method="GET" style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:12px;margin-bottom:10px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px">HOW MANY PEOPLE ARE YOU CONTACTING TODAY?</div>'
    + '<div style="display:flex;gap:8px">'
    + '<input name="n" value="' + current + '" inputmode="numeric" style="width:30%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:18px;text-align:center;font-weight:bold">'
    + '<button type="submit" style="flex:1;padding:11px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:14px;cursor:pointer">GENERATE MY LIST</button>'
    + '</div></form>';
}
// ---------------- FIXED SESSION LIST (Sept 13 2026) ----------------
// Once Boss taps GENERATE MY LIST, the list is PINNED to his device (crm_q cookie)
// for the session. Logging outcomes shows DONE markers on the SAME cards and NEVER
// slides fresh prospects into the bottom. A new batch only appears when he taps
// GENERATE MY LIST again. Cookie format: crm_q=<size>|<id>,<id>,...
function pinnedFromReq(req: Request): { size: number; ids: string[] } {
  try {
    const ck = (req.headers.get("Cookie") || "").match(/crm_q=(\d{1,3})\|([A-Za-z0-9,]+)/);
    if (!ck) return { size: 0, ids: [] };
    const ids = ck[2].split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 100);
    return { size: parseInt(ck[1], 10) || ids.length || 10, ids };
  } catch { return { size: 0, ids: [] }; }
}
function pinCookie(size: number, ids: string[]): string {
  return "crm_q=" + Math.max(1, Math.min(100, size)) + "|" + ids.slice(0, 100).join(",") + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400";
}
async function fetchPinned(db: any, ids: string[]): Promise<any[]> {
  const out: any[] = [];
  for (const id of ids) {
    try {
      const recs = await db.entities.MasterContact.filter({ id });
      if (recs && recs.length) out.push(recs[0]);
    } catch { /* skip missing */ }
  }
  return out;
}
function multiNumberCardHtml(c: any, todayStr: string): string {
  const parts = splitPhoneNumbers(String(c.phone || ""));
  const map = numOutcomesMap(c);
  return parts.map(function (p, i) {
    const logged = String(map[String(i)] || "") === todayStr;
    const digits = p.replace(/[^0-9+]/g, "");
    return '<div style="margin-top:4px;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      + '<a href="tel:' + escSrv(digits) + '" style="color:#4ade80;text-decoration:none">&#128222; ' + escSrv(p) + "</a>"
      + (logged
        ? '<span style="font-size:10px;font-weight:bold;color:#4ade80;border:1px solid #4ade80;border-radius:99px;padding:1px 7px;white-space:nowrap">&#10003; LOGGED</span>'
        : '<span style="font-size:10px;font-weight:bold;color:#fbbf24;border:1px solid #fbbf24;border-radius:99px;padding:1px 7px;white-space:nowrap">NEEDS OUTCOME</span>')
      + "</div>";
  }).join("");
}
function fixedCard(c: any, todayStr: string): string {
  const tier = String(c.prospectTier || c.contactStatus || "");
  const col = QTIER_COLOR[tier] || "#a78bfa";
  const phone = String(c.phone || "");
  const prog = numbersDoneToday(c, todayStr);
  const done = prog.total > 0 && prog.done === prog.total;
  const partial = prog.total > 1 && prog.done > 0 && !done;
  const ch = c.channelStatus || {};
  const channelNote = ch.hasUsableChannel === false
    ? '<div style="margin-top:4px;color:#f87171;font-size:12px">&#9888; No usable channel</div>'
    : (ch.phoneDead && ch.usableChannel && ch.usableChannel !== "phone"
        ? '<div style="margin-top:4px;color:#fbbf24;font-size:12px">&#9990; Phone dead — use ' + escSrv(ch.usableChannel) + '</div>'
        : "");
  return '<div style="background:#15151f;border:1px solid ' + (done ? "#14532d" : "#262636") + ';border-radius:12px;padding:12px;margin-bottom:10px' + (done ? ";opacity:.72" : "") + '">'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:16px;font-weight:bold">' + escSrv(c.fullName || "(unnamed)") + (done ? ' <span style="font-size:10px;font-weight:bold;color:#4ade80;border:1px solid #4ade80;border-radius:99px;padding:2px 8px;white-space:nowrap">&#10003; DONE TODAY</span>' : (partial ? ' <span style="font-size:10px;font-weight:bold;color:#fbbf24;border:1px solid #fbbf24;border-radius:99px;padding:2px 8px;white-space:nowrap">' + prog.done + "/" + prog.total + " LOGGED</span>" : "")) + '</div><div style="font-size:10px;font-weight:bold;color:' + col + ';border:1px solid ' + col + ';border-radius:99px;padding:2px 8px">' + (QTIER_LABEL[tier] || "CONTACT") + "</div></div>"
    + (phone ? (splitPhoneNumbers(phone).length > 1
        ? '<div style="margin-top:6px">' + multiNumberCardHtml(c, todayStr) + "</div>"
        : '<div style="margin-top:6px;font-size:15px">' + phoneLinksHtml(phone, "#4ade80") + "</div>") : (c.email ? '<div style="margin-top:6px;font-size:14px"><a href="mailto:' + escSrv(c.email) + '" style="color:#60a5fa;text-decoration:none">&#9993; ' + escSrv(c.email) + "</a></div>" : ""))
    + channelNote
    + (c.nextAction && !done ? '<div style="margin-top:6px;color:#f5d142;font-size:13px">&#10148; ' + escSrv(c.nextAction) + "</div>" : "")
    + (c.whyNow && !done ? '<div style="margin-top:4px;color:#8b8b9e;font-size:12px">' + escSrv(c.whyNow) + "</div>" : "")
    + (displayLocation(c) ? '<div style="margin-top:4px;color:#a78bfa;font-size:12px">&#128205; ' + escSrv(displayLocation(c)) + "</div>" : "")
    + '<div style="margin-top:8px"><a href="?log=' + escSrv(c.id) + '" style="color:#60a5fa;font-size:12px;font-weight:bold;text-decoration:none">&#9998; LOG OUTCOME &#8594;</a></div>'
    + "</div>";
}
function staticFixedList(cards: any[], sizeN: number, todayStr: string, stats?: any): string {
  let h = staticSizeForm(Math.max(1, Math.min(100, sizeN || cards.length || 10)));
  const doneN = cards.filter((c: any) => { const p = numbersDoneToday(c, todayStr); return p.total > 0 && p.done === p.total; }).length;
  const partialN = cards.filter((c: any) => { const p = numbersDoneToday(c, todayStr); return p.done > 0 && p.done < p.total; }).length;
  h += '<div style="font-size:12px;color:#8b8b9e;margin:2px 0 10px">YOUR ' + cards.length + ' FOR THIS SESSION &#183; ' + doneN + ' DONE' + (partialN ? ' &#183; ' + partialN + ' STILL NEEDS A NUMBER' : "") + ' &#183; THE LIST STAYS FIXED UNTIL YOU TAP GENERATE MY LIST &#183; TAP A NUMBER TO CALL</div>';
  if (stats && stats.byTier) {
    const st = stats.byTier;
    const chipStyle = "font-size:11px;padding:5px 10px;border-radius:99px;background:#1c1c28;border:1px solid #262636;color:#8b8b9e;white-space:nowrap;display:inline-flex;align-items:center";
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;max-width:100%">'
      + '<span style="' + chipStyle + '">&#9888; Due: ' + (st.due_commitment || 0) + '</span>'
      + '<span style="' + chipStyle + '">&#128161; Fresh: ' + (st.fresh_never_contacted || 0) + '</span>'
      + '<span style="' + chipStyle + '">&#128200; Active: ' + (st.active_pipeline || 0) + '</span>'
      + '<span style="' + chipStyle + '">&#128260; Re-engage: ' + (st.re_engagement || 0) + '</span>'
      + '<span style="' + chipStyle + '">Stale (excluded): ' + (st.stale_dead || 0) + '</span></div>';
  }
  if (!cards.length) return h + '<div style="color:#8b8b9e">Nothing queued right now.</div>';
  if (doneN === cards.length) h += '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#127881; ALL ' + cards.length + ' DONE &#8212; tap GENERATE MY LIST when you want your next batch.</div>';
  for (const c of cards) h += fixedCard(c, todayStr);
  return h;
}
// Renders the session list: the pinned list if one exists, otherwise computes + pins a fresh one.
// regen=true (GENERATE MY LIST tapped) always recomputes and re-pins.
async function renderSessionList(db: any, req: Request, regen: boolean): Promise<{ html: string; cookie?: string }> {
  const sizeN = readReqSize(req.url, req);
  const todayStr = todayEtStr();
  if (!regen) {
    const pinned = pinnedFromReq(req);
    if (pinned.ids.length) {
      const recs = await fetchPinned(db, pinned.ids);
      if (recs.length) return { html: staticFixedList(recs, pinned.size || recs.length, todayStr) };
    }
  }
  const eq = await getEngineQueue(db, sizeN);
  if (eq) return { html: staticFixedList(eq.queue, sizeN, todayStr, eq.stats), cookie: eq.queue.length ? pinCookie(sizeN, eq.queue.map((c: any) => c.id)) : undefined };
  const contacts = await db.entities.MasterContact.list();
  return { html: staticList(contacts || []) };
}

// Pulls just the "Possibly lives in X, ST" fragment out of relationshipType for display.
function locLine(rt: unknown): string {
  const m = String(rt || "").match(/Possibly lives in[^/]*/i);
  return m ? m[0].trim() : "";
}
// LIVE LOCATION FALLBACK (Sept 14, 2026 fix): freshly-imported contacts never had an
// outcome logged yet, so relationshipType never got the "Possibly lives in X" note
// written into it (that only happens once, at log time). Without this fallback the
// location line silently disappeared for every never-contacted record. Compute it
// live for display from the phone's area code when relationshipType doesn't already
// carry a guess — never persisted, never overwrites a manual/logged note.
function displayLocation(c: any): string {
  const existing = locLine(c.relationshipType);
  if (existing) return existing;
  const loc = guessLocationFromPhone(c.phone);
  return loc ? "Possibly lives in " + loc : "";
}

// ---------------- session cookie helper (form flow auth) ----------------
async function getCookieSession(req: Request, db: any): Promise<any | null> {
  try {
    const ck = (req.headers.get("Cookie") || "").match(/crm_tok=([A-Za-z0-9_-]+)/);
    if (!ck) return null;
    const h = await sha256hex(ck[1]);
    const sess = await db.entities.McSession.filter({ token: h });
    if (!sess || !sess.length) return null;
    const s0 = sess[0];
    if (s0.expiresAt && s0.expiresAt < new Date().toISOString()) return null;
    return s0;
  } catch { return null; }
}
function readReqSize(reqUrl: string, req: Request): number {
  try {
    const qn = new URL(reqUrl).searchParams.get("n");
    const cn = (req.headers.get("Cookie") || "").match(/crm_n=(\d{1,3})/);
    const qk = (req.headers.get("Cookie") || "").match(/crm_q=(\d{1,3})\|/);
    const raw = parseInt(String(qn || (cn ? cn[1] : (qk ? qk[1] : ""))), 10);
    if (raw >= 1 && raw <= 100) return raw;
  } catch { /* fall through */ }
  return 10;
}
function todayEtStr(): string {
  try {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return (et.getMonth() + 1) + "/" + et.getDate() + "/" + String(et.getFullYear()).slice(2);
  } catch { return ""; }
}

// ---------------- ONE-TAP OUTCOME PRESETS ----------------
// Each key maps to Jeremy's OWN historical Sheet phrasing (extracted from the master
// Sheet col G on Sept 13, 2026) so one tap writes exactly what he would have typed
// by hand. {date} is replaced with the form's date (default today, ET).
const OUTCOME_PRESETS: Record<string, string> = {
  na_text: "Called {date} NA, sent text",
  oos: "Called {date} NA, number no longer in service, sent text just in case",
  restricted: "Called {date} NA, number not available or restricted, sent text just in case",
  fb_msg: "Called {date} NA, sent FB message",
  text_only: "Sent text {date}",
  not_looking: "Called {date} not looking at the moment",
  wrong_number: "Called {date} wrong number",
  out_country: "Out of country {date}",
  vm: "NA, straight to VM {date}",
  vm_notsetup: "Called {date} NA, voicemail not set up yet, left text",
  vm_full: "Called NA, VM full, sent text message {date}",
  vm_straight_full: "Called {date} and went straight to VM, mailbox is full but wouldn't have left a message anyways so I can try back later",
  vm_noring: "Called {date} NA, didn't even ring, just went to VM, sent text",
  business: "Business {date}",
};

// "Report what happened" form — works with ZERO JavaScript (primary mobile path).
// One tap on a preset button saves it immediately; no typing needed.
function outcomeGridHtml(actionUrl: string, contact: any, todayStr: string, err: string, nidx?: number): string {
  const act = actionUrl ? ' action="' + actionUrl + '"' : '';
  const errBox = err ? '<div style="background:#7f1d1d;color:#fecaca;padding:10px;border-radius:8px;margin-bottom:10px;font-size:14px">' + escSrv(err) + "</div>" : "";
  const prefill = "Called " + todayStr + " ";
  const pStyle = "display:block;width:100%;padding:12px 6px;border-radius:10px;border:1px solid #2c2c3c;background:#1c1c28;color:#f0f0f4;font-weight:700;font-size:12px;cursor:pointer;text-align:center;box-sizing:border-box";
  const pbtn = (key: string, label: string) => '<button type="submit" name="preset" value="' + key + '" style="' + pStyle + '">' + label + "</button>";
  const dbtn = (key: string, label: string, bg: string, col: string) => '<button type="submit" name="preset2" value="' + key + '" style="display:block;width:100%;padding:13px 6px;border-radius:10px;border:none;background:' + bg + ';color:' + col + ';font-weight:700;font-size:13px;cursor:pointer;text-align:center">' + label + "</button>";
  return errBox
    + '<form method="GET"' + act + '>'
    + '<input type="hidden" name="op" value="logOutcome"><input type="hidden" name="fmt" value="html"><input type="hidden" name="id" value="' + escSrv(contact.id) + '">' + (nidx != null ? '<input type="hidden" name="nidx" value="' + nidx + '">' : "")
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:6px">TAP WHAT HAPPENED &#8212; ONE TAP SAVES IT</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
    + pbtn("na_text", "NO ANSWER &#8212; SENT TEXT")
    + pbtn("oos", "NO LONGER IN SERVICE")
    + pbtn("restricted", "NOT AVAILABLE / RESTRICTED")
    + pbtn("fb_msg", "NA &#8212; SENT FB MESSAGE")
    + pbtn("text_only", "TEXTED (NO CALL)")
    + pbtn("not_looking", "NOT LOOKING")
    + '<button type="submit" name="preset2" value="wrong_number" style="' + pStyle + '">WRONG NUMBER &#8212; ADD DETAILS</button>' 
    + pbtn("out_country", "OUT OF COUNTRY")
    + pbtn("vm", "STRAIGHT TO VM")
    + pbtn("vm_notsetup", "VM NOT SET UP")
    + pbtn("vm_full", "VM FULL")
    + pbtn("vm_straight_full", "VM: STRAIGHT + FULL")
    + pbtn("vm_noring", "NO RING &#8594; VM")
    + pbtn("business", "BUSINESS")
    + "</div>"
    + '<div style="margin-bottom:8px">'
    + dbtn("qi", "&#10003; TALKED &#8212; BOOKED QI (add day + time)", "#4ade80", "#0b0b13")
    + "</div>"
    + '<div style="margin-bottom:8px">'
    + dbtn("callback", "&#128376; CALLBACK SCHEDULED (add day + time)", "#60a5fa", "#0b0b13")
    + "</div>"
    + '<div style="margin-bottom:8px">'
    + dbtn("wrong_name", "&#10060; WRONG NUMBER &#8212; GOT A NAME (type it)", "#f87171", "#0b0b13")
    + "</div>"
    + '<div style="margin-bottom:12px">'
    + dbtn("no_reason", "&#10060; NO &#8212; WITH A REASON (type it)", "#f87171", "#0b0b13")
    + "</div>"
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">OR WRITE IT YOURSELF (anything else)</div>'
    + '<textarea name="outcome" rows="3" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">' + escSrv(prefill) + '</textarea>'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">DATE (M/D/YY)</div>'
    + '<input name="date" value="' + escSrv(todayStr) + '" style="width:60%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:10px">'
    + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">SAVE OUTCOME</button>'
    + "</form>"
    + '<div style="font-size:11px;color:#8b8b9e;margin-top:8px">One tap saves to CRM instantly; your Google Sheet updates automatically within ~5 minutes (queued writeback, identity-checked).</div>';
}

// Single-number "REPORT WHAT HAPPENED" card (classic Sept 13 2026 flow, unchanged behavior).
function staticLogForm(actionUrl: string, contact: any, todayStr: string, err: string): string {
  const phone = String(contact.phone || "");
  return '<div style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">REPORT WHAT HAPPENED</div>'
    + '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">' + escSrv(contact.fullName || "(unnamed)") + "</div>"
    + (phone ? '<div style="font-size:15px;margin-bottom:10px">' + phoneLinksHtml(phone, "#4ade80") + "</div>" : "")
    + outcomeGridHtml(actionUrl, contact, todayStr, err);
}
// MULTI-NUMBER OUTCOME PAGE (Sept 14, 2026): one outcome section PER number, so Boss logs
// what happened on EACH call instead of one outcome for the whole person. A number shows
// a green LOGGED TODAY chip once its outcome is saved; the contact only counts DONE when
// every number is logged. Each section's buttons carry that number's index (nidx), so the
// saved note is prefixed with the exact number it refers to.
function staticMultiLogForm(actionUrl: string, contact: any, todayStr: string, err: string): string {
  const parts = splitPhoneNumbers(String(contact.phone || ""));
  const map = numOutcomesMap(contact);
  let logged = 0;
  for (let i = 0; i < parts.length; i++) if (String(map[String(i)] || "") === todayStr) logged++;
  let firstErrShown = false;
  let h = '<div style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">REPORT WHAT HAPPENED &#8212; ONE OUTCOME PER NUMBER</div>'
    + '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">' + escSrv(contact.fullName || "(unnamed)") + "</div>"
    + '<div style="font-size:12px;color:#fbbf24;margin-bottom:12px">' + parts.length + " NUMBERS &#183; " + logged + " logged today &#183; log each number you called so nothing gets forgotten on a rough day.</div>";
  for (let i = 0; i < parts.length; i++) {
    const isLogged = String(map[String(i)] || "") === todayStr;
    h += '<div style="background:#15151f;border:1px solid ' + (isLogged ? "#14532d" : "#262636") + ';border-radius:12px;padding:12px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px"><div style="font-size:15px;font-weight:bold">NUMBER ' + (i + 1) + " OF " + parts.length + " &#183; " + escSrv(parts[i]) + "</div>"
      + (isLogged
        ? '<span style="font-size:10px;font-weight:bold;color:#4ade80;border:1px solid #4ade80;border-radius:99px;padding:2px 8px;white-space:nowrap">&#10003; LOGGED TODAY</span>'
        : '<span style="font-size:10px;font-weight:bold;color:#fbbf24;border:1px solid #fbbf24;border-radius:99px;padding:2px 8px;white-space:nowrap">NEEDS OUTCOME</span>')
      + "</div>";
    if (isLogged) {
      h += '<div style="font-size:13px;color:#bbf7d0">Outcome saved for this number today.</div>';
    } else {
      const errFor = (!firstErrShown && err) ? (firstErrShown = true, err) : "";
      h += outcomeGridHtml(actionUrl, contact, todayStr, errFor, i);
    }
    h += "</div>";
  }
  return h + "</div>";
}
// Stage-2 detail form for outcomes that need a day/time (QI booked, callback scheduled).
function staticLogDetailForm(actionUrl: string, contact: any, kind: string, todayStr: string, err: string, nidx?: number): string {
  const act = actionUrl ? ' action="' + actionUrl + '"' : '';
  const errBox = err ? '<div style="background:#7f1d1d;color:#fecaca;padding:10px;border-radius:8px;margin-bottom:10px;font-size:14px">' + escSrv(err) + "</div>" : "";
  const isQi = kind === "qi";
  const isWrong = kind === "wrong_name";
  const isWrongNum = kind === "wrong_number";
  const isNo = kind === "no_reason";
  const title = isQi ? "&#10003; BOOKED A QI &#8212; WHEN?" : (isWrong ? "&#10060; WRONG NUMBER &#8212; WHO IS IT?" : (isWrongNum ? "&#10060; WRONG NUMBER &#8212; ANYTHING ELSE?" : (isNo ? "&#10060; NO &#8212; WHAT WAS THE REASON?" : "&#128376; CALLBACK &#8212; WHEN?")));
  return '<div style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">REPORT WHAT HAPPENED</div>'
    + '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">' + title + "</div>"
    + '<div style="font-size:15px;font-weight:600;margin-bottom:10px">' + escSrv(contact.fullName || "(unnamed)") + "</div>"
    + errBox
    + '<form method="GET"' + act + '>'
    + '<input type="hidden" name="op" value="logOutcome2"><input type="hidden" name="fmt" value="html"><input type="hidden" name="id" value="' + escSrv(contact.id) + '"><input type="hidden" name="kind" value="' + (isQi ? "qi" : (isWrong ? "wrong_name" : (isWrongNum ? "wrong_number" : (isNo ? "no_reason" : "callback")))) + '">' + (nidx != null ? '<input type="hidden" name="nidx" value="' + nidx + '">' : "")
    + ((isWrong || isWrongNum)
      ? '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">WHO THE NUMBER BELONGS TO (optional &#8212; like &#8220;Claire&#8221; or &#8220;Top Notch Tint business number&#8221;)</div>'
        + '<input name="name" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">'
      : (isNo
      ? '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">REASON (like &#8220;too busy at the moment&#8221;, &#8220;works three jobs&#8221;, &#8220;was very rude&#8221;)</div>'
        + '<input name="name" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">'
      : '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">DAY (like &#8220;next day 9/14/26&#8221;)</div>'
        + '<input name="day" placeholder="' + (isQi ? "next day 9/14/26" : "9/16/26") + '" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">'
        + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">TIME (like &#8220;7PM EST&#8221;)</div>'
        + '<input name="time" placeholder="7PM EST" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px">'))
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">EXTRA DETAIL (optional)</div>'
    + '<textarea name="note" rows="2" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px"></textarea>'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">DATE (M/D/YY)</div>'
    + '<input name="date" value="' + escSrv(todayStr) + '" style="width:60%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:10px">'
    + (isWrongNum
      ? '<div style="margin-bottom:8px"><button type="submit" name="delivery" value="delivered" style="width:100%;padding:13px;border-radius:8px;border:none;background:#4ade80;color:#0b0b13;font-weight:bold;font-size:15px;cursor:pointer">SAVE &#8212; TEXTED, MESSAGE DELIVERED</button></div>'
        + '<div style="margin-bottom:8px"><button type="submit" name="delivery" value="not" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f87171;color:#0b0b13;font-weight:bold;font-size:15px;cursor:pointer">SAVE &#8212; TEXTED, DIDN&#39;T DELIVER</button></div>'
        + '<div style="margin-bottom:8px"><button type="submit" name="delivery" value="skip" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">SAVE &#8212; NO TEXT / NOTHING ELSE</button></div>'
      : '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">SAVE OUTCOME</button>')
    + "</form>"
    + '<div style="margin-top:8px"><a href="?log=' + escSrv(contact.id) + '" style="color:#8b8b9e;font-size:13px">&#8592; BACK TO OUTCOME BUTTONS</a></div>'
    + "</div>";
}

// ---------------- TEXT DELIVERY STATUS (stage 2, Sept 13, 2026) ----------------
// Boss's habit (his words: "I try to send a text anyways and then I say whether or
// not delivered"): after any outcome that sends a text/FB message, one quick second
// screen records whether it actually delivered. iPhone SMS shows "Delivered" under
// the bubble; dead numbers never show it. His Sheet already carries notes like
// "says could not be delivered" / "but says didn't deliver" — this makes it one tap.
// CRM-UX-003 (Sept 30, 2026, Boss): "vm" (STRAIGHT TO VM) now asks the delivery
// follow-up too — Boss texted after these calls and wanted to log whether it delivered.
const TEXT_SENDING_PRESETS = new Set(["na_text", "oos", "restricted", "fb_msg", "text_only", "vm_notsetup", "vm_full", "vm_noring", "vm"]);
function staticDeliveryForm(actionUrl: string, contact: any, presetKey: string, todayStr: string, nidx?: number): string {
  const act = actionUrl ? ' action="' + actionUrl + '"' : '';
  const dStyle = (bg: string, col: string) => "display:block;width:100%;padding:13px 6px;border-radius:10px;border:none;background:" + bg + ";color:" + col + ";font-weight:700;font-size:14px;cursor:pointer;text-align:center";
  return '<div style="background:#15151f;border:1px solid #f5d142;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">REPORT WHAT HAPPENED</div>'
    + '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">DID THE TEXT DELIVER?</div>'
    + '<div style="font-size:15px;font-weight:600;margin-bottom:10px">' + escSrv(contact.fullName || "(unnamed)") + "</div>"
    + '<form method="GET"' + act + '>'
    + '<input type="hidden" name="op" value="logOutcome"><input type="hidden" name="fmt" value="html"><input type="hidden" name="id" value="' + escSrv(contact.id) + '"><input type="hidden" name="preset" value="' + escSrv(presetKey) + '"><input type="hidden" name="date" value="' + escSrv(todayStr) + '">' + (nidx != null ? '<input type="hidden" name="nidx" value="' + nidx + '">' : "")
    + '<div style="margin-bottom:8px"><button type="submit" name="delivery" value="delivered" style="' + dStyle("#4ade80", "#0b0b13") + '">&#10003; YES &#8212; DELIVERED</button></div>'
    + '<div style="margin-bottom:8px"><button type="submit" name="delivery" value="not" style="' + dStyle("#f87171", "#0b0b13") + '">&#10060; NO &#8212; DIDN&#39;T DELIVER</button></div>'
    + '<div style="margin-bottom:12px"><button type="submit" name="delivery" value="skip" style="' + dStyle("#262636", "#f0f0f4") + '">SKIP &#8212; JUST SAVE IT</button></div>'
    + "</form>"
    + '<div style="margin-top:8px"><a href="?log=' + escSrv(contact.id) + '" style="color:#8b8b9e;font-size:13px">&#8592; BACK TO OUTCOME BUTTONS</a></div>'
    + "</div>";
}

// ---------------- WRONG-NUMBER PIVOT TEXT (copy-paste scripts, Sept 13, 2026) ----------------
// Boss's real-world scenario: he calls the number on file for {targetName} (the CRM
// record itself), reaches a stranger instead, and wants ready-to-copy pivot texts that
// turn the wrong-number call into a warm lead ask. Two variants depending on whether
// he already has the stranger's real name (from texting back and forth) or not yet.
// REGULAR OUTREACH TEXT (Sept 13, 2026, night): Boss's standard follow-up text after
// a missed call / no answer — his exact wording, personalized with the contact's
// first name (the same pitch as the SCRIPT widget, but "Hey {FirstName}").
// CRM-UX-002 (Sept 28, 2026): these templates get escaped ONCE inside pivotCopyBox,
// so names must go in RAW. Escaping here too made apostrophes/special characters show
// up as literal HTML entities (O'Brien -> O&#39;Brien) in the copy-text boxes.
function firstNameOf(contact: any): string {
  const f = String(contact.firstName || "").trim();
  if (f) return f;
  const full = String(contact.fullName || "").trim();
  return full ? full.split(/\s+/)[0] : "";
}
function regularTemplate(firstName: string): string {
  return "Hey " + firstName + ", this is Jeremy. I know this is out of the blue, but I wanted to reach out briefly.\n\n"
    + "My business team is expanding our project. I find there's generally two kinds of people, those content relying just on their job, and those who want to build a second income stream to take the pressure off their monthly expenses.\n\n"
    + "It might be a perfect fit for you, or it might not be, either way is totally fine.\n\n"
    + "If you keep your options open, would it be okay if I showed you how we build that second income?";
}
function pivotTemplateNoName(targetName: string): string {
  return "Hey, this is Jeremy, the one who just called.\n\n"
    + "Since I was looking for someone named " + targetName + ", who I was referred to, sounds like I was given an outdated or incorrect number.\n\n"
    + "Since I happened to reach you though, let me ask you a quick question before I let you go.\n\n"
    + "I work with a business team that's expanding right now, and we're looking for a few additional people. Obviously, I know absolutely nothing about you at this point, so I can't make any promises that it would even be a good fit.\n\n"
    + "But rather than just chalking this up as a wrong number, are you by chance open to any additional income right now?";
}
function pivotTemplateWithName(targetName: string, theirName: string): string {
  return "Well " + theirName + ", this is Jeremy, the one who just called.\n\n"
    + "Since I was looking for someone named " + targetName + ", who I was referred to, sounds like I was given an outdated or incorrect number.\n\n"
    + "Since I happened to reach you though, let me ask you a quick question before I let you go.\n\n"
    + "I work with a business team that's expanding right now, and we're looking for a few additional people. Obviously, I know absolutely nothing about you at this point, so I can't make any promises that it would even be a good fit.\n\n"
    + "But rather than just chalking this up as a wrong number, are you by chance open to any additional income right now?";
}
// Readonly textarea + COPY button. Works with zero JS (tap-hold-select-all-copy on the
// textarea itself); the button is a pure progressive enhancement on top of that.
function pivotCopyBox(boxId: string, text: string): string {
  return '<textarea id="' + boxId + '" readonly rows="9" style="width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:14px;margin-bottom:8px">' + escSrv(text) + '</textarea>'
    + '<button type="button" onclick="doCopy(&#39;' + boxId + '&#39;,this)" style="width:100%;padding:12px;border-radius:8px;border:none;background:#a78bfa;color:#0b0b13;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:4px">COPY THIS MESSAGE</button>'
    + '<div style="font-size:11px;color:#8b8b9e;margin-bottom:12px">No JS? Tap inside the box, Select All, Copy — then paste into your text.</div>';
}
// Full pivot section: template A (no name) always ready, plus a form to add their name
// and get template B. GET-based (no save, nothing to persist) — works with zero JS.
function pivotSection(actionUrl: string, contact: any, theirNameQ: string): string {
  const targetName = String(contact.fullName || "(unnamed)"); // CRM-UX-002: raw name, pivotCopyBox escapes once
  let h = '<div style="background:#15151f;border:1px solid #a78bfa;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">TEXTS TO COPY</div>'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:10px">Tap COPY, then paste it into your text</div>'
    + '<div style="font-size:12px;color:#a78bfa;margin-bottom:6px">REGULAR OUTREACH (no answer / missed call)</div>'
    + pivotCopyBox("regularText", regularTemplate(firstNameOf(contact)))
    + '<div style="font-size:12px;color:#a78bfa;margin-bottom:6px;margin-top:6px">WRONG NUMBER PIVOT &#8212; DON&#39;T HAVE THEIR NAME YET</div>'
    + pivotCopyBox("pivotNoName", pivotTemplateNoName(targetName));
  h += '<div style="font-size:12px;color:#a78bfa;margin-bottom:6px;margin-top:6px">GOT THEIR NAME? TYPE IT BELOW</div>'
    + '<form method="GET">'
    + '<input type="hidden" name="log" value="' + escSrv(contact.id) + '">'
    + '<div style="display:flex;gap:8px;margin-bottom:8px">'
    + '<input name="theirName" value="' + escSrv(theirNameQ) + '" placeholder="Their first name" style="flex:1;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px">'
    + '<button type="submit" style="padding:11px 16px;border-radius:8px;border:none;background:#a78bfa;color:#0b0b13;font-weight:bold;font-size:13px;cursor:pointer">GET TEXT</button>'
    + '</div></form>';
  if (theirNameQ) {
    h += pivotCopyBox("pivotWithName", pivotTemplateWithName(targetName, theirNameQ)); // CRM-UX-002: raw, pivotCopyBox escapes once
  }
  h += "</div>";
  return h;
}

// Shared save path for every outcome source (preset, typed, or detail form):
// appends the note, stamps the date, clears the tier override, and queues the
// identity-checked Sheet writeback (cols A/F/G/H only).
async function applyOutcome(db: any, c0: any, appendText: string, newDate: string, nidx?: number, presetKey?: string): Promise<void> {
  const prevNotes = String(c0.notes || "").trim();
  const newNotes = prevNotes ? prevNotes + " / " + appendText : appendText;
  const stage = String(c0.amwayStage || "prospecting");
  const activeStage = ["QI", "info_session", "mentor_next_step", "onboarding", "sponsorship_customer"].includes(stage);
  const oldRelType = String(c0.relationshipType || "");
  const withLoc = withLocationGuess(oldRelType, String(c0.phone || ""));
  const newRelationshipType = withGenderNote(withLoc, String(c0.firstName || ""), String(c0.fullName || ""));
  const relationshipTypeChanged = newRelationshipType !== oldRelType;
  const oldCaller = String(c0.assignedCaller || "").trim();
  const newCaller = oldCaller || guessCallerFromName(String(c0.firstName || ""), String(c0.fullName || ""));
  const callerAssigned = !oldCaller && !!newCaller;
  const patch: Record<string, unknown> = {
    notes: newNotes,
    lastInteractionDate: newDate,
    // BUSINESS (Oct 6, 2026, Boss): a business number is not a real contact. Pin it
    // STALE so the Daily Action Engine excludes it from every generated call list —
    // Boss's batch always fills with 10 real people, never a business to skip over.
    prospectTier: presetKey === "business" ? "stale_dead" : "", // clear override so the Daily Action Engine recomputes the tier from notes/date
    contactStatus: presetKey === "business" ? "stale_dead" : (activeStage ? "active_pipeline" : "re_engagement"),
  };
  if (relationshipTypeChanged) patch.relationshipType = newRelationshipType;
  if (callerAssigned) patch.assignedCaller = newCaller;
  if (nidx != null) {
    const map = numOutcomesMap(c0);
    map[String(nidx)] = newDate;
    patch.numberOutcomes = JSON.stringify(map);
  }
  await db.entities.MasterContact.update(c0.id, patch);
  if (c0.sheetRowNumber) {
    try {
      await db.entities.SheetWriteback.create({
        status: "pending", attempts: 0,
        contactId: c0.id, contactName: String(c0.fullName || ""), phone: String(c0.phone || ""),
        rowNumber: Number(c0.sheetRowNumber), appendText, newDate,
        colFText: relationshipTypeChanged ? newRelationshipType : "",
        colAText: callerAssigned ? newCaller : "",
      });
    } catch { /* CRM note still saved; writeback retryable */ }
  }
}

// ---------------- PIN hashing (same stack as crmApi) ----------------
const PBKDF2_ITERS = 100000;
async function pbkdf2Hex(pin: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits)).map((b: number) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function randSaltHex(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}
async function hashPinPbkdf2(pin: string): Promise<string> {
  const saltHex = randSaltHex();
  return "pbkdf2$" + PBKDF2_ITERS + "$" + saltHex + "$" + await pbkdf2Hex(pin, saltHex, PBKDF2_ITERS);
}
async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith("pbkdf2$")) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 4) return false;
  return (await pbkdf2Hex(pin, parts[2], parseInt(parts[1], 10))) === parts[3];
}
function publicPath(req: Request): string {
  try {
    const appId = req.headers.get("base44-app-id") || "";
    const fnName = req.headers.get("base44-function-name") || "";
    if (appId && fnName) return "/api/apps/" + appId + "/functions/" + fnName;
  } catch { /* fall through */ }
  try { return new URL(req.url).pathname; } catch { return "/"; }
}
// SCRIPT WIDGET (Sept 14 2026 fix): Boss's complaint — after logging an outcome and
// scrolling down, the floating SCRIPT button was gone (it only lived in the full-JS
// app shell, never in the zero-JS pageShell used by every outcome/log page), forcing
// several taps of the browser back button just to see it again. Now every pageShell
// page (log form, saved confirmation, next-contact page, login, etc.) carries the same
// floating widget, pinned via position:fixed so it survives scrolling to the bottom.
// ---------------- SCRIPT LIBRARY (Oct 6, 2026, Boss) ----------------
// The SCRIPT popup used to hold ONE hard-coded script. Now Boss can save as many
// scripts as he wants (stored in the CrmScript entity). The popup lists their names;
// tapping a name opens that script inside the same popup. If nothing is saved yet,
// the original built-in FIRST CONTACT script still shows so the popup never breaks.
const BUILTIN_SCRIPT_BODY = "Hey ____, this is Jeremy. I know this is out of the blue, but I wanted to reach out briefly.\n\nMy business team is expanding our project. I find there's generally two kinds of people, those content relying just on their job, and those who want to build a second income stream to take the pressure off their monthly expenses.\n\nIt might be a perfect fit for you, or it might not be, either way is totally fine.\n\nIf you keep your options open, would it be okay if I showed you how we build that second income?";
async function fetchScripts(db: any): Promise<any[]> {
  try {
    const arr = (await db.entities.CrmScript.list() || []).slice();
    arr.sort(function (a: any, b: any) {
      const d = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      if (d) return d;
      return String(a.created_date || "").localeCompare(String(b.created_date || ""));
    });
    return arr;
  } catch { return []; }
}
function scriptWidgetHtml(bottomPx: number, actionUrl: string, scripts: any[]): string {
  const manageUrl = (actionUrl || "") + ((actionUrl || "").indexOf("?") === -1 ? "?op=scripts" : "&op=scripts");
  let inner = '<div style="color:#8b8b9e;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">' + (scripts.length ? "MY SCRIPTS &#8212; TAP ONE TO OPEN IT" : "SCRIPT") + "</div>";
  if (scripts.length) {
    for (const s of scripts) {
      inner += '<details style="border-bottom:1px solid #262636">'
        + '<summary style="cursor:pointer;padding:9px 4px;font-weight:700;color:#f5d142;list-style:none;font-size:13px">' + escSrv(s.title) + "</summary>"
        + '<div style="white-space:pre-wrap;line-height:1.6;padding:10px 12px;background:#1c1c28;border-radius:10px;margin:8px 0;color:#f0f0f4">' + escSrv(String(s.body || "")) + "</div>"
        + "</details>";
    }
  } else {
    inner += '<div style="font-size:13px;line-height:1.6">' + escSrv(BUILTIN_SCRIPT_BODY).replace(/\n/g, "<br>") + "</div>";
  }
  inner += '<a href="' + escSrv(manageUrl) + '" style="display:block;margin-top:10px;color:#60a5fa;font-weight:700;font-size:12px">+ ADD OR EDIT SCRIPTS</a>';
  return '<details id="scriptWidget" style="position:fixed;bottom:' + bottomPx + 'px;right:14px;z-index:60;max-width:min(320px,86vw)">'
    + '<summary style="list-style:none;background:var(--gold,#f5d142);color:#111;font-weight:bold;font-size:13px;padding:10px 16px;border-radius:99px;box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;display:inline-block">&#128220; SCRIPT</summary>'
    + '<div style="background:#15151f;border:1px solid #262636;border-radius:12px;padding:14px;margin-top:8px;font-size:13px;max-height:55vh;overflow:auto;box-shadow:0 4px 14px rgba(0,0,0,.45);color:#f0f0f4">'
    + inner + '</div></details><style>#scriptWidget summary::-webkit-details-marker{display:none}#scriptWidget summary::marker{content:\'\'}</style>';
}
// Manage page: add a new script, edit or delete saved ones. Zero-JS, GET forms only.
function scriptBanner(kind: "ok" | "err", text: string): string {
  if (!text) return "";
  const bg = kind === "ok" ? "#14532d" : "#7f1d1d";
  const fg = kind === "ok" ? "#bbf7d0" : "#fecaca";
  return '<div style="background:' + bg + ';color:' + fg + ';padding:10px;border-radius:8px;margin-bottom:10px">' + text + "</div>";
}
function scriptEditForm(actionUrl: string, s: any, err: string): string {
  const isEdit = !!(s && s.id);
  const act = actionUrl ? ' action="' + actionUrl + '"' : "";
  const inStyle = "width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px";
  return scriptBanner("err", err)
    + '<div style="background:#15151f;border:1px solid #a78bfa;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">' + (isEdit ? "EDIT SCRIPT" : "ADD A NEW SCRIPT") + "</div>"
    + '<form method="GET"' + act + ">"
    + '<input type="hidden" name="op" value="scriptSave">' + (isEdit ? '<input type="hidden" name="id" value="' + escSrv(s.id) + '">' : "")
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">SCRIPT NAME (like &#8220;FIRST CONTACT&#8221;)</div>'
    + '<input name="title" maxlength="80" value="' + escSrv(s ? s.title : "") + '" placeholder="First contact" style="' + inStyle + '">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">THE WORDS &#8212; use ____ where their name goes</div>'
    + '<textarea name="body" rows="8" placeholder="Hey ____, this is Jeremy..." style="' + inStyle + ';min-height:140px">' + escSrv(s ? s.body : "") + "</textarea>"
    + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">' + (isEdit ? "SAVE CHANGES" : "SAVE SCRIPT") + "</button>"
    + "</form></div>"
    + '<div><a href="' + escSrv(actionUrl + "?op=scripts") + '" style="color:#8b8b9e;font-size:13px">&#8592; BACK TO MY SCRIPTS</a></div>';
}
function scriptManageHtml(actionUrl: string, scripts: any[], banner: string): string {
  const act = actionUrl ? ' action="' + actionUrl + '"' : "";
  const inStyle = "width:95%;padding:11px;border-radius:8px;border:1px solid #444;background:#1c1c28;color:#fff;font-size:16px;margin-bottom:8px";
  let h = '<div style="font-size:20px;font-weight:bold;color:#f5d142;margin-bottom:4px">MY CALL SCRIPTS</div>'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:12px">Save as many as you want. The SCRIPT button on every page lists them &#8212; tap one to open it.</div>'
    + scriptBanner("ok", banner);
  for (const s of scripts) {
    h += '<div style="background:#15151f;border:1px solid #262636;border-radius:12px;padding:14px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px"><div style="font-size:15px;font-weight:bold;color:#f5d142">' + escSrv(s.title) + "</div>"
      + '<div style="display:flex;gap:8px">'
      + '<a href="' + escSrv(actionUrl + "?op=scriptEdit&id=" + s.id) + '" style="font-size:12px;font-weight:700;color:#60a5fa">EDIT</a>'
      + '<a href="' + escSrv(actionUrl + "?op=scriptDeleteAsk&id=" + s.id) + '" style="font-size:12px;font-weight:700;color:#f87171">DELETE</a>'
      + "</div></div>"
      + '<div style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#f0f0f4;background:#1c1c28;border-radius:10px;padding:10px">' + escSrv(String(s.body || "")) + "</div>"
      + "</div>";
  }
  if (!scripts.length) h += '<div style="background:#1c1c28;border:1px solid #262636;border-radius:12px;padding:14px;margin-bottom:12px;color:#8b8b9e;font-size:13px">No saved scripts yet &#8212; the popup still shows the built-in FIRST CONTACT script. Add yours below.</div>';
  h += '<div style="background:#15151f;border:1px solid #a78bfa;border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">ADD A NEW SCRIPT</div>'
    + '<form method="GET"' + act + ">"
    + '<input type="hidden" name="op" value="scriptSave">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">SCRIPT NAME (like &#8220;FIRST CONTACT&#8221;)</div>'
    + '<input name="title" maxlength="80" placeholder="First contact" style="' + inStyle + '">'
    + '<div style="font-size:12px;color:#8b8b9e;margin-bottom:4px">THE WORDS &#8212; use ____ where their name goes</div>'
    + '<textarea name="body" rows="8" placeholder="Hey ____, this is Jeremy..." style="' + inStyle + ';min-height:140px"></textarea>'
    + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f5d142;color:#111;font-weight:bold;font-size:15px;cursor:pointer">SAVE SCRIPT</button>'
    + "</form></div>"
    + '<div><a href="' + escSrv(actionUrl) + '" style="color:#8b8b9e;font-size:13px">&#8592; BACK TO MY CRM</a></div>';
  return h;
}
// (HISTORICAL — Sept 28 2026 CRM-UX-001 reverted the auto-advance; this helper now only
// decides whether the "Session complete" banner shows.) Original Sept 14 2026 fix:
// outcome he landed on a "confirmation + full list" page and had to scroll/tap back
// several times to reach the next contact. Now a save goes STRAIGHT to the next
// not-yet-done contact's own log form (same page, script still pinned) — no detour
// through the full list at all. The full list only reappears once everyone in the
// pinned session is done, or if Boss explicitly taps "back to full list".
async function nextPendingContact(db: any, req: Request): Promise<any | null> {
  const pinned = pinnedFromReq(req);
  if (!pinned.ids.length) return null;
  const todayStr = todayEtStr();
  const recs = await fetchPinned(db, pinned.ids);
  for (const c of recs) {
    const prog = numbersDoneToday(c, todayStr);
    if (prog.done < prog.total) return c;
  }
  return null;
}
function logFormFor(actionUrl: string, c: any, todayStr: string): string {
  return splitPhoneNumbers(String(c.phone || "")).length > 1
    ? staticMultiLogForm(actionUrl, c, todayStr, "")
    : staticLogForm(actionUrl, c, todayStr, "");
}
function pageShell(inner: string, widgetHtml?: string): string {
  // *{box-sizing:border-box} is required here: every static form/button below uses
  // width:XX% plus padding, and without this reset the browser default (content-box)
  // makes those elements render WIDER than their container, causing right-edge
  // overflow on narrow phones (the "cut off / extra space on the right" bug).
  // doCopy() v3 (Sept 14 2026 fix): iOS Safari's back-forward cache (bfcache) can restore
  // a page snapshot from BEFORE a JS fix was deployed when the user swipes/taps back — this
  // ignores Cache-Control entirely, so Boss can still see old broken behavior even after a
  // fix ships. Fix: pageshow listener forces a hard reload whenever the page was restored
  // from bfcache (event.persisted === true), guaranteeing fresh JS every time this page shows.
  // ALSO hardened doCopy itself: select() now runs FIRST and synchronously (before any
  // Promise/clipboard-API call), so the text is always visibly highlighted with iOS's native
  // Copy bubble the instant the button is tapped — a guaranteed fallback even if
  // navigator.clipboard.writeText silently fails or is unavailable in a given browser context.
  const copyScript = '<script>'
    + 'window.addEventListener("pageshow",function(e){if(e.persisted){location.reload();}});'
    + 'function doCopy(id,btn){var t=document.getElementById(id);t.focus();t.select();t.setSelectionRange(0,999999);var text=t.value;'
    + 'function done(ok){btn.textContent=ok?"COPIED! PASTE IT INTO YOUR TEXT":"HIGHLIGHTED \u2014 TAP THE COPY BUBBLE ABOVE";setTimeout(function(){btn.textContent="COPY THIS MESSAGE";},2500);}'
    + 'function fallback(){try{done(document.execCommand("copy"));}catch(e){done(false);}}'
    + 'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true);}).catch(fallback);}else{fallback();}'
    + '}</' + 'script>';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VANTRA CRM</title>'
    + '<style>*{box-sizing:border-box}body{overflow-x:hidden}</style>' + copyScript + '</head>' +
    '<body style="background:#0b0b13;color:#f0f0f4;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:0;padding:14px;min-height:100vh;max-width:100vw;overflow-x:hidden">' +
    '<div style="max-width:720px;margin:0 auto;width:100%">' +
    '<div style="font-size:20px;letter-spacing:2px;color:#f5d142;font-weight:bold;margin-bottom:12px">VANTRA CRM</div>' +
    inner + (widgetHtml || scriptWidgetHtml(14, "", [])) + '</div></body></html>';
}

// ---------------- same-URL form POST handling (no JavaScript, no cross-URL jump) ----------------
async function handleFormPost(req: Request): Promise<Response> {
  const H: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  let db: any = null;
  try { const b: any = createClientFromRequest(req); db = b.asServiceRole; } catch { db = null; }
  if (!db) return new Response(pageShell('<div style="color:#f87171;padding:10px">Server unavailable — reopen your CRM link and try again.</div>'), { status: 200, headers: H });
  let params = new URLSearchParams("");
  try { params = new URLSearchParams(await req.text()); } catch { /* empty */ }
  // Sept 13 2026: Boss's iPhone form POSTs are rejected with 405 "Method Not Allowed"
  // at the platform edge (they never reach this function and never appear in its logs),
  // while his GETs always arrive. So every form below now submits via method="GET" and
  // the URL query params are merged in here. Body params (back-compat) still win if present.
  try {
    const qp = new URL(req.url).searchParams;
    for (const k of Array.from(new Set(Array.from(qp.keys())))) {
      if (!params.get(k)) params.set(k, qp.get(k) || "");
    }
  } catch { /* ignore */ }
  const op = (params.get("op") || "").trim();
  const now = new Date().toISOString();
  const mkCookie = (t: string) => "crm_tok=" + t + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400";

  // SCRIPT LIBRARY (Oct 6, 2026): every page below carries the live script list in the popup.
  let W = scriptWidgetHtml(14, "", []);
  try { W = scriptWidgetHtml(14, publicPath(req), await fetchScripts(db)); } catch { /* built-in fallback */ }
  const ps = (inner: string) => pageShell(inner, W);

  if (op === "setupPin") {
    const pin = params.get("pin") || "";
    const confirmPin = params.get("confirmPin") || "";
    let err = "";
    if (!pin || !confirmPin) err = "Fill in both PIN fields.";
    else if (pin.length < 6 || pin.length > 30) err = "PIN must be 6-30 characters.";
    else if (pin !== confirmPin) err = "PINs did not match.";
    if (err) return new Response(ps(staticForm("", "setup", err)), { status: 200, headers: H });
    const cfg = await db.entities.McConfig.list();
    if (!cfg || !cfg.length) return new Response(ps(staticForm("", "setup", "Setup unavailable — reopen your CRM link.")), { status: 200, headers: H });
    const c0 = cfg[0];
    if (c0.pinHash) return new Response(ps(staticForm("", "login", "")), { status: 200, headers: H });
    await db.entities.McConfig.update(c0.id, {
      pinHash: await hashPinPbkdf2(pin), pinSalt: "", setupTokenHash: "", setupExpiresAt: "",
      failCount: 0, lockUntil: "", updatedBy: "first-run-form",
    });
    const all = await db.entities.McSession.list();
    for (const sess of all) { try { await db.entities.McSession.delete(sess.id); } catch { /* non-fatal */ } }
    const tokPlain = "crm_" + crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await db.entities.McSession.create({ token: await sha256hex(tokPlain), deviceLabel: "form-setpin", createdAt: now, expiresAt: expires, lastSeenAt: now });
    const rl = await renderSessionList(db, req, false);
    const good = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; PIN set — your CRM is locked down. Reopen your CRM link anytime and enter your PIN.</div>' + rl.html;
    const hh = new Headers(H);
    hh.append("Set-Cookie", mkCookie(tokPlain));
    if (rl.cookie) hh.append("Set-Cookie", rl.cookie);
    return new Response(ps(good), { status: 200, headers: hh });
  }

  if (op === "login") {
    const pin = params.get("pin") || "";
    if (!pin) return new Response(ps(staticForm("", "login", "Enter your PIN.")), { status: 200, headers: H });
    const cfg = await db.entities.McConfig.list();
    if (!cfg || !cfg.length || !cfg[0].pinHash) return new Response(ps(staticForm("", "setup", "No PIN is set yet — choose one below.")), { status: 200, headers: H });
    const c0 = cfg[0];
    const lu = String(c0.lockUntil || "");
    if (lu && lu > now) return new Response(ps(staticForm("", "login", "Too many attempts — wait a few minutes.")), { status: 200, headers: H });
    if (!(await verifyPin(pin, String(c0.pinHash)))) {
      const failCount = (typeof c0.failCount === "number" ? c0.failCount : 0) + 1;
      const patch: Record<string, unknown> = { failCount };
      if (failCount % 5 === 0) {
        const m = failCount >= 15 ? 60 : failCount >= 10 ? 15 : 5;
        patch["lockUntil"] = new Date(Date.now() + m * 60 * 1000).toISOString();
      }
      try { await db.entities.McConfig.update(c0.id, patch); } catch { /* non-fatal */ }
      return new Response(ps(staticForm("", "login", "Wrong PIN — try again.")), { status: 200, headers: H });
    }
    try { if (c0.failCount || c0.lockUntil) await db.entities.McConfig.update(c0.id, { failCount: 0, lockUntil: "" }); } catch { /* non-fatal */ }
    const tokPlain = "crm_" + crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await db.entities.McSession.create({ token: await sha256hex(tokPlain), deviceLabel: "form-login", createdAt: now, expiresAt: expires, lastSeenAt: now });
    const rl = await renderSessionList(db, req, false);
    const good = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; Unlocked — your session list is below. It stays unlocked on this device.</div>' + rl.html;
    const hh = new Headers(H);
    hh.append("Set-Cookie", mkCookie(tokPlain));
    if (rl.cookie) hh.append("Set-Cookie", rl.cookie);
    return new Response(ps(good), { status: 200, headers: hh });
  }


  if (op === "logOutcome") {
    const sess = await getCookieSession(req, db);
    if (!sess) return new Response(ps(staticForm("", "login", "Enter your PIN first.")), { status: 200, headers: H });
    const id = params.get("id") || "";
    const outcome = (params.get("outcome") || "").trim();
    const dateIn = (params.get("date") || "").trim();
    const newDate = dateIn || todayEtStr();
    const preset = (params.get("preset") || "").trim();
    const preset2 = (params.get("preset2") || "").trim();
    const recs = await db.entities.MasterContact.filter({ id });
    if (!recs || !recs.length) return new Response(ps('<div style="color:#f87171">Contact not found.</div>'), { status: 200, headers: H });
    const c0 = recs[0];
    // MULTI-NUMBER (Sept 14, 2026): which number is this outcome about? Forms on the
    // per-number page carry nidx; if missing/stale, default to the first number not yet
    // logged today so nothing silently skips.
    const multiParts = splitPhoneNumbers(String(c0.phone || ""));
    const isMulti = multiParts.length > 1;
    let nidx = parseInt(params.get("nidx") || "", 10);
    if (isMulti && (isNaN(nidx) || nidx < 0 || nidx >= multiParts.length)) {
      const map0 = numOutcomesMap(c0);
      nidx = 0;
      while (nidx < multiParts.length && String(map0[String(nidx)] || "") === newDate) nidx++;
      if (nidx >= multiParts.length) nidx = 0;
    }
    const nidxArg = isMulti ? nidx : undefined;
    // Outcomes that need a day/time (QI booked, callback) open the detail form first.
    if (preset2 === "qi" || preset2 === "callback" || preset2 === "wrong_name" || preset2 === "no_reason" || preset2 === "wrong_number") {
      return new Response(ps(staticLogDetailForm(publicPath(req), c0, preset2, newDate, "", nidxArg)), { status: 200, headers: H });
    }
    // Text-sending presets ask one quick follow-up: did the text actually deliver?
    const delivery = (params.get("delivery") || "").trim();
    if (preset && TEXT_SENDING_PRESETS.has(preset) && !delivery) {
      return new Response(ps(staticDeliveryForm(publicPath(req), c0, preset, newDate, nidxArg)), { status: 200, headers: H });
    }
    // One-tap preset: writes Jeremy's own historical Sheet phrasing, with the date.
    let appendText = (preset && OUTCOME_PRESETS[preset]) ? OUTCOME_PRESETS[preset].replace("{date}", newDate) : outcome;
    // Sept 13 2026 (later that night): delivered is the assumed default — only note it when
    // it did NOT deliver, so notes stay clean instead of stating the obvious every time.
    // CRM-UX-003 (Sept 30, 2026, Boss): "vm" is special — its template has no text mention,
    // so a delivered text must add "sent text" and a bounce must say so explicitly.
    // SKIP keeps the plain "NA, straight to VM {date}" note (no text claimed).
    if (preset === "vm") {
      if (delivery === "delivered") appendText += ", sent text";
      else if (delivery === "not") appendText += ", sent text, didn't deliver";
      else if (delivery === "skip") appendText += ", no text sent";
    } else if (preset && OUTCOME_PRESETS[preset] && delivery === "not") appendText += ", didn't deliver";
    if (!appendText) {
      return new Response(ps(isMulti
        ? staticMultiLogForm(publicPath(req), c0, todayEtStr(), "Tap an outcome or write what happened first.")
        : staticLogForm(publicPath(req), c0, todayEtStr(), "Tap an outcome or write what happened first.")), { status: 200, headers: H });
    }
    // Per-number outcomes are prefixed with the exact number they refer to, so the
    // history (CRM + Sheet col G) is never ambiguous on a multi-number contact.
    if (isMulti) appendText = ordinalNumberLabel(nidx) + ": " + appendText;
    try { await applyOutcome(db, c0, appendText, newDate, nidxArg, preset || preset2 || undefined); } catch (e) {
      return new Response(ps('<div style="color:#f87171">Could not save the note. Try again.</div>'), { status: 200, headers: H });
    }
    // MULTI-NUMBER: after saving one number, send Boss straight back to the per-number
    // page with the saved number green and the remaining numbers still open — he only
    // sees the full list again once EVERY number has an outcome.
    if (isMulti) {
      const recs2 = await db.entities.MasterContact.filter({ id });
      const fresh = recs2 && recs2.length ? recs2[0] : c0;
      const prog = numbersDoneToday(fresh, newDate);
      if (prog.done < prog.total) {
        const left = prog.total - prog.done;
        const more = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; Saved &#8212; &#8220;' + escSrv(appendText) + "&#8221; " + left + " more number" + (left > 1 ? "s" : "") + " to log for " + escSrv(fresh.fullName || "this contact") + ' &#8212; keep going:</div>';
        return new Response(ps(more + staticMultiLogForm(publicPath(req), fresh, newDate, "")), { status: 200, headers: H });
      }
      const allDone = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; All ' + prog.total + " numbers logged &#8212; " + escSrv(fresh.fullName || "") + " done for today. Your Google Sheet (row " + escSrv(fresh.sheetRowNumber || "?") + ') updates automatically within ~5 minutes.</div>';
      // CRM-UX-001: main list after save, no auto-advance to the next contact.
      const rl2 = await renderSessionList(db, req, false);
      const hh2 = new Headers(H);
      if (rl2.cookie) hh2.append("Set-Cookie", rl2.cookie);
      const batch2 = await nextPendingContact(db, req);
      return new Response(ps(allDone + (batch2 ? "" : '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#127881; Session complete &#8212; tap GENERATE MY LIST for your next batch.</div>') + rl2.html), { status: 200, headers: hh2 });
    }
    // CRM-UX-001 (Sept 28, 2026, Boss): after SAVE OUTCOME return to the MAIN LIST,
    // not the next contact. The Sept 14 auto-advance ("NEXT UP") is reverted.
    const good0 = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; Saved &#8212; &#8220;' + escSrv(appendText) + '&#8221; CRM updated now. Your Google Sheet (row ' + escSrv(c0.sheetRowNumber || "?") + ') updates automatically within ~5 minutes.</div>';
    // CRM-UX-001: main list after save, no auto-advance to the next contact.
    const rl = await renderSessionList(db, req, false);
    const hh = new Headers(H);
    if (rl.cookie) hh.append("Set-Cookie", rl.cookie);
    const batchLeft = await nextPendingContact(db, req);
    return new Response(ps(good0 + (batchLeft ? "" : '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#127881; Session complete &#8212; tap GENERATE MY LIST for your next batch.</div>') + rl.html), { status: 200, headers: hh });
  }

  if (op === "logOutcome2") {
    const sess = await getCookieSession(req, db);
    if (!sess) return new Response(ps(staticForm("", "login", "Enter your PIN first.")), { status: 200, headers: H });
    const id = params.get("id") || "";
    const kind = (params.get("kind") || "").trim();
    const day = (params.get("day") || "").trim();
    const time = (params.get("time") || "").trim();
    const note = (params.get("note") || "").trim();
    const name = (params.get("name") || "").trim();
    const delivery = (params.get("delivery") || "").trim();
    const dateIn = (params.get("date") || "").trim();
    const newDate = dateIn || todayEtStr();
    const recs = await db.entities.MasterContact.filter({ id });
    if (!recs || !recs.length) return new Response(ps('<div style="color:#f87171">Contact not found.</div>'), { status: 200, headers: H });
    const c0 = recs[0];
    // MULTI-NUMBER (Sept 14, 2026): same per-number rules as logOutcome — stage-2 forms
    // carry nidx through, prefix the note with the number, and return to the per-number
    // page until every number has an outcome.
    const multiParts = splitPhoneNumbers(String(c0.phone || ""));
    const isMulti = multiParts.length > 1;
    let nidx = parseInt(params.get("nidx") || "", 10);
    if (isMulti && (isNaN(nidx) || nidx < 0 || nidx >= multiParts.length)) {
      const map0 = numOutcomesMap(c0);
      nidx = 0;
      while (nidx < multiParts.length && String(map0[String(nidx)] || "") === newDate) nidx++;
      if (nidx >= multiParts.length) nidx = 0;
    }
    const nidxArg = isMulti ? nidx : undefined;
    if (kind !== "qi" && kind !== "callback" && kind !== "wrong_name" && kind !== "no_reason" && kind !== "wrong_number") {
      return new Response(ps(isMulti
        ? staticMultiLogForm(publicPath(req), c0, todayEtStr(), "")
        : staticLogForm(publicPath(req), c0, todayEtStr(), "")), { status: 200, headers: H });
    }
    if (kind !== "wrong_number" && ((kind === "wrong_name" || kind === "no_reason") ? (!name && !note) : (!day && !time && !note))) {
      const msg = kind === "wrong_name" ? "Type the name (or use the plain WRONG NUMBER button instead)." : (kind === "no_reason" ? "Type the reason (or use NOT LOOKING instead)." : "Add the day or time so you remember when.");
      return new Response(ps(staticLogDetailForm(publicPath(req), c0, kind, newDate, msg, nidxArg)), { status: 200, headers: H });
    }
    let appendText;
    if (kind === "wrong_number") {
      // WRONG NUMBER + details (Oct 6, 2026, Boss): optional who-it-is note plus
      // whether the just-in-case text actually delivered — matches his Sheet phrasing.
      appendText = "Called " + newDate + " wrong number" + (name ? " (" + name + ")" : "");
      if (note) appendText += " " + note;
      if (delivery === "delivered") appendText += ", sent text, message delivered";
      else if (delivery === "not") appendText += ", sent text, didn't deliver";
    } else if (kind === "wrong_name") {
      appendText = "Called " + newDate + " wrong number" + (name ? " (" + name + ")" : "");
      if (note) appendText += " " + note;
    } else if (kind === "no_reason") {
      appendText = "No, " + (name || note);
      if (name && note) appendText = "No, " + name + ", " + note;
    } else {
      appendText = kind === "qi" ? ("Called " + newDate + " and booked QI") : ("Called " + newDate + " callback scheduled");
      if (day) appendText += " for " + day;
      if (time) appendText += " at " + time;
      if (note) appendText += " " + note;
    }
    if (isMulti) appendText = ordinalNumberLabel(nidx) + ": " + appendText;
    try { await applyOutcome(db, c0, appendText, newDate, nidxArg, undefined); } catch (e) {
      return new Response(ps('<div style="color:#f87171">Could not save the note. Try again.</div>'), { status: 200, headers: H });
    }
    if (isMulti) {
      const recs2 = await db.entities.MasterContact.filter({ id });
      const fresh = recs2 && recs2.length ? recs2[0] : c0;
      const prog = numbersDoneToday(fresh, newDate);
      if (prog.done < prog.total) {
        const left = prog.total - prog.done;
        const more = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; Saved &#8212; &#8220;' + escSrv(appendText) + "&#8221; " + left + " more number" + (left > 1 ? "s" : "") + " to log for " + escSrv(fresh.fullName || "this contact") + ' &#8212; keep going:</div>';
        return new Response(ps(more + staticMultiLogForm(publicPath(req), fresh, newDate, "")), { status: 200, headers: H });
      }
      const allDone = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; All ' + prog.total + " numbers logged &#8212; " + escSrv(fresh.fullName || "") + " done for today. Your Google Sheet (row " + escSrv(fresh.sheetRowNumber || "?") + ') updates automatically within ~5 minutes.</div>';
      // CRM-UX-001: main list after save, no auto-advance to the next contact.
      const rl2 = await renderSessionList(db, req, false);
      const hh2 = new Headers(H);
      if (rl2.cookie) hh2.append("Set-Cookie", rl2.cookie);
      const batch2 = await nextPendingContact(db, req);
      return new Response(ps(allDone + (batch2 ? "" : '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#127881; Session complete &#8212; tap GENERATE MY LIST for your next batch.</div>') + rl2.html), { status: 200, headers: hh2 });
    }
    const good0 = '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#10003; Saved &#8212; &#8220;' + escSrv(appendText) + '&#8221; CRM updated now. Your Google Sheet (row ' + escSrv(c0.sheetRowNumber || "?") + ') updates automatically within ~5 minutes.</div>';
    // CRM-UX-001: main list after save, no auto-advance to the next contact.
    const rl = await renderSessionList(db, req, false);
    const hh = new Headers(H);
    if (rl.cookie) hh.append("Set-Cookie", rl.cookie);
    const batchLeft = await nextPendingContact(db, req);
    return new Response(ps(good0 + (batchLeft ? "" : '<div style="background:#14532d;color:#bbf7d0;padding:10px;border-radius:8px;margin-bottom:10px">&#127881; Session complete &#8212; tap GENERATE MY LIST for your next batch.</div>') + rl.html), { status: 200, headers: hh });
  }

  // ---------------- SCRIPT LIBRARY ops (Oct 6, 2026, Boss) ----------------
  if (op === "scripts" || op === "scriptSave" || op === "scriptEdit" || op === "scriptDeleteAsk" || op === "scriptDeleteDo") {
    const sess = await getCookieSession(req, db);
    if (!sess) return new Response(ps(staticForm("", "login", "Enter your PIN first.")), { status: 200, headers: H });
    const act = publicPath(req);
    const id = (params.get("id") || "").trim();
    if (op === "scripts") {
      return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "")), { status: 200, headers: H });
    }
    if (op === "scriptEdit") {
      const recs = id ? await db.entities.CrmScript.filter({ id }) : [];
      if (!recs || !recs.length) return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "Script not found \u2014 it may already be deleted.")), { status: 200, headers: H });
      return new Response(ps(scriptEditForm(act, recs[0], "")), { status: 200, headers: H });
    }
    if (op === "scriptSave") {
      const title = (params.get("title") || "").trim().substring(0, 80);
      const body = (params.get("body") || "").trim().substring(0, 6000);
      if (!title || !body) return new Response(ps(scriptEditForm(act, { id, title, body }, "Add the name and the words first.")), { status: 200, headers: H });
      if (id) {
        const recs = await db.entities.CrmScript.filter({ id });
        if (!recs || !recs.length) return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "Script not found \u2014 it may already be deleted.")), { status: 200, headers: H });
        await db.entities.CrmScript.update(id, { title, body });
        return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "&#10003; Saved \u2014 script updated.")), { status: 200, headers: H });
      }
      const all = await fetchScripts(db);
      await db.entities.CrmScript.create({ title, body, sortOrder: all.length });
      return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "&#10003; Saved \u2014 it now shows in the SCRIPT popup on every page.")), { status: 200, headers: H });
    }
    if (op === "scriptDeleteAsk") {
      const recs = id ? await db.entities.CrmScript.filter({ id }) : [];
      if (!recs || !recs.length) return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "Script not found \u2014 it may already be deleted.")), { status: 200, headers: H });
      const s0 = recs[0];
      return new Response(ps(
        '<div style="background:#7f1d1d;color:#fecaca;padding:10px;border-radius:8px;margin-bottom:10px">Delete &#8220;' + escSrv(s0.title) + '&#8221;? This cannot be undone.</div>'
        + '<div style="background:#15151f;border:1px solid #262636;border-radius:12px;padding:14px;margin-bottom:14px">'
        + '<div style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#f0f0f4;background:#1c1c28;border-radius:10px;padding:10px">' + escSrv(String(s0.body || "")) + "</div>"
        + '<form method="GET" action="' + act + '"><input type="hidden" name="op" value="scriptDeleteDo"><input type="hidden" name="id" value="' + escSrv(s0.id) + '">'
        + '<button type="submit" style="width:100%;padding:13px;border-radius:8px;border:none;background:#f87171;color:#111;font-weight:bold;font-size:15px;cursor:pointer;margin-top:12px">YES, DELETE IT</button></form>'
        + '<div style="margin-top:10px"><a href="' + act + '?op=scripts" style="color:#60a5fa;font-size:13px;font-weight:700">CANCEL &#8212; KEEP IT</a></div>'
        + "</div>"), { status: 200, headers: H });
    }
    if (op === "scriptDeleteDo") {
      try { if (id) await db.entities.CrmScript.delete(id); } catch { /* already gone */ }
      return new Response(ps(scriptManageHtml(act, await fetchScripts(db), "Deleted.")), { status: 200, headers: H });
    }
  }

    return new Response(ps('<div style="color:#8b8b9e">Unknown action. <a href="' + publicPath(req) + '" style="color:#60a5fa">Back to my CRM</a></div>'), { status: 200, headers: H });
}

function buildHtml(staticInner: string, pinSetAttr: string, tokAttr: string, scriptWidget?: string): string {
const SW = scriptWidget || scriptWidgetHtml(78, "", []);
return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>VANTRA CRM</title>
<style>
  :root { --bg:#0b0b13; --card:#15151f; --card2:#1c1c28; --line:#262636; --txt:#f0f0f4; --mut:#8b8b9e; --gold:#f5d142; --green:#4ade80; --blue:#60a5fa; --yellow:#fbbf24; --red:#f87171; --purple:#a78bfa; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { background:var(--bg); color:var(--txt); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; min-height:100vh; padding-bottom:90px; }
  .wrap { max-width:720px; margin:0 auto; padding:14px 14px 20px; }
  h1 { font-size:20px; letter-spacing:2px; color:var(--gold); }
  .hdr { display:flex; justify-content:space-between; align-items:center; padding:14px 4px 10px; }
  .hdr .sub { font-size:11px; color:var(--mut); margin-top:2px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:10px; }
  .card.tap:active { background:var(--card2); }
  .row { display:flex; gap:8px; align-items:center; justify-content:space-between; }
  .name { font-size:16px; font-weight:600; }
  .mut { color:var(--mut); font-size:12px; }
  .sm { font-size:13px; }
  .badge { display:inline-block; font-size:10px; font-weight:700; letter-spacing:.5px; padding:3px 8px; border-radius:99px; border:1px solid; text-transform:uppercase; }
  .b-due { color:var(--red); border-color:var(--red); }
  .b-fresh { color:var(--green); border-color:var(--green); }
  .b-active { color:var(--blue); border-color:var(--blue); }
  .b-re { color:var(--yellow); border-color:var(--yellow); }
  .b-stale { color:var(--mut); border-color:var(--mut); }
  .b-def { color:var(--purple); border-color:var(--purple); }
  .tier-due_commitment { color:var(--red); border-color:var(--red); }
  .tier-fresh_never_contacted { color:var(--green); border-color:var(--green); }
  .tier-active_pipeline { color:var(--blue); border-color:var(--blue); }
  .tier-re_engagement { color:var(--yellow); border-color:var(--yellow); }
  .tier-stale_dead { color:var(--mut); border-color:var(--mut); }
  input,textarea,select,button { font-family:inherit; font-size:15px; }
  input,textarea,select { width:100%; background:var(--card2); color:var(--txt); border:1px solid var(--line); border-radius:10px; padding:11px 12px; outline:none; }
  input:focus,textarea:focus { border-color:var(--gold); }
  textarea { min-height:70px; resize:vertical; }
  button { background:var(--gold); color:#111; font-weight:700; border:none; border-radius:10px; padding:12px 16px; width:100%; cursor:pointer; }
  button.ghost { background:transparent; color:var(--txt); border:1px solid var(--line); }
  button:active { opacity:.8; }
  .btnsm { width:auto; padding:8px 12px; font-size:12px; }
  label { display:block; font-size:11px; color:var(--mut); margin:10px 0 4px; text-transform:uppercase; letter-spacing:1px; }
  .nav { position:fixed; bottom:0; left:0; right:0; background:#101018f2; backdrop-filter:blur(10px); border-top:1px solid var(--line); display:flex; padding:6px 0 max(8px, env(safe-area-inset-bottom)); z-index:50; }
  .nav button { background:none; color:var(--mut); font-size:10px; font-weight:600; padding:6px 0; width:25%; }
  .nav button.on { color:var(--gold); }
  .nav .ic { font-size:20px; display:block; margin-bottom:2px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
  .chip { font-size:11px; padding:5px 10px; border-radius:99px; background:var(--card2); border:1px solid var(--line); color:var(--mut); }
  .notes { white-space:pre-wrap; font-size:13px; line-height:1.5; background:var(--card2); border-radius:10px; padding:10px; margin-top:8px; }
  .kv { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .kv .box { background:var(--card2); border-radius:10px; padding:8px 10px; }
  .kv .box .l { font-size:10px; color:var(--mut); text-transform:uppercase; letter-spacing:1px; }
  .kv .box .v { font-size:14px; margin-top:2px; }
  a { color:var(--blue); }
  .hidden { display:none; }
  #msg { position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:#222; border:1px solid var(--line); color:var(--txt); padding:10px 18px; border-radius:99px; font-size:13px; z-index:99; opacity:0; transition:opacity .3s; pointer-events:none; max-width:90%; text-align:center; }
  .spin { text-align:center; color:var(--mut); padding:30px; font-size:13px; }
</style>
</head>
<body data-pinset="${pinSetAttr}" data-tok="${tokAttr}">
<div id="static">${staticInner}</div>
<div id="login" class="wrap hidden">
  <div class="hdr"><div><h1>VANTRA CRM</h1><div class="sub">Your relationships. One system. Always in your pocket. [V3]</div></div></div>
  <div class="card">
    <label>PIN</label>
    <input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="Enter PIN">
    <div style="height:12px"></div>
    <button onclick="doLogin()">UNLOCK CRM</button>
    <div class="mut" style="margin-top:10px;text-align:center">Same PIN as Mission Control</div>
  </div>
</div>
<div id="setup" class="wrap hidden">
  <div class="hdr"><div><h1>VANTRA CRM</h1><div class="sub">Set your new PIN — one-time secure link</div></div></div>
  <div class="card">
    <label>NEW PIN (6+ characters)</label>
    <input id="npin" type="password" autocomplete="off" placeholder="Choose your new PIN">
    <div style="height:12px"></div>
    <label>CONFIRM PIN</label>
    <input id="npin2" type="password" autocomplete="off" placeholder="Re-enter your new PIN">
    <div style="height:16px"></div>
    <button onclick="doSetup()">SET PIN &amp; UNLOCK</button>
    <div class="mut" style="margin-top:10px;text-align:center">This one-time link works once, then dies. Your PIN is stored only as an irreversible hash and unlocks Mission Control and this CRM. It is never visible to anyone, including your agent.</div>
  </div>
</div>
<div id="app" class="wrap hidden">
  <div class="hdr"><div><h1>VANTRA CRM</h1><div class="sub" id="sync">—</div></div><div class="mut" id="whoami"></div></div>
  <div id="view"></div>
</div>
<div id="msg"></div>
${SW}
<nav class="nav hidden" id="nav">
  <button data-v="today" onclick="show('today')"><span class="ic">⚡</span>Today</button>
  <button data-v="search" onclick="show('search')"><span class="ic">🔍</span>Search</button>
  <button data-v="add" onclick="show('add')"><span class="ic">＋</span>Add</button>
  <button data-v="more" onclick="show('more')"><span class="ic">⋯</span>More</button>
</nav>
<script>
var API = (location.origin || (location.protocol+'//'+location.host)) + location.pathname.replace(/crmApp.*/, 'crmApi');
var TOK = localStorage.getItem('crm_tok') || '';
var V = 'today';

// ---- universal compat layer: old browsers (pre-2016 iPhone Safari, IE9/10, old Chrome) ----
function MiniP(fn){ this.s=null; this.f=null; this.done=0; this.ok=0; this.v=null; this.e=null; var t=this; fn(function(v){ if(t.done){return;} t.done=1; t.ok=1; t.v=v; if(t.s){t.s(v);} }, function(e){ if(t.done){return;} t.done=1; t.ok=0; t.e=e; if(t.f){t.f(e);} }); }
MiniP.prototype.then=function(f,g){ var t=this; return new MiniP(function(res,rej){ function fin(w){ if(w&&typeof w.then==='function'){ try{ w.then(res,rej); }catch(e2){ rej(e2); } return; } res(w); } t.s=function(v){ var w; try{ w=f?f(v):v; }catch(e){ rej(e); return; } fin(w); }; t.f=function(e){ if(g){ var w2; try{ w2=g(e); }catch(e2){ rej(e2); return; } fin(w2); return; } rej(e); }; if(t.done){ if(t.ok){ t.s(t.v); } else { t.f(t.e); } } }); };
MiniP.prototype.catch=function(f){ return this.then(null,f); };
MiniP.resolve=function(v){ return new MiniP(function(r){ r(v); }); };
var HASP=(typeof Promise!=='undefined'&&Promise.prototype&&typeof Promise.prototype.then==='function');
var HASF=(typeof fetch==='function');
function P(fn){ return HASP?new Promise(fn):new MiniP(fn); }
function resv(v){ return HASP?Promise.resolve(v):MiniP.resolve(v); }
function asg(a,b){ for(var k in (b||{})){ a[k]=b[k]; } return a; }
function req(url,opts){
  if(HASF){ return fetch(url,opts); }
  return P(function(resolve,reject){
    try{
      var x=new XMLHttpRequest();
      x.open(opts.method||'POST',url,true);
      x.setRequestHeader('Content-Type','application/json');
      if(opts.headers&&opts.headers.Authorization){ x.setRequestHeader('Authorization',opts.headers.Authorization); }
      x.onreadystatechange=function(){ if(x.readyState===4){ var raw=x.responseText||''; var j=null; try{ j=JSON.parse(raw||'{}'); }catch(e){ reject('network'); return; } resolve({ ok:(x.status>=200&&x.status<300), status:x.status, json:function(){ return resv(j); }, text:function(){ return resv(raw); } }); } };
      x.onerror=function(){ reject('network'); };
      x.send(opts.body||null);
    }catch(e){ reject(e); }
  });
}
function hide(id){ try{ document.getElementById(id).style.display='none'; }catch(e){} }
function unhide(id){ try{ document.getElementById(id).style.display='block'; }catch(e){} }

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function toast(t){ var m=document.getElementById('msg'); m.textContent=t; m.style.opacity=1; clearTimeout(m._t); m._t=setTimeout(function(){ m.style.opacity=0; },2200); }
function api(op, body){ return req(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOK},body:JSON.stringify(asg({op:op},body||{}))}).then(function(r){ return r.json().then(function(j){ if(!j.ok && j.error){ throw j.error; } return j; }); }); }

function doLogin(){
  var p = document.getElementById('pin').value.trim();
  if(!p){ toast('Enter your PIN'); return; }
  req(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'login',pin:p,deviceLabel:navigator.userAgent.indexOf('iPhone')>-1?'iphone-crm':(navigator.userAgent.indexOf('Lenovo')>-1?'lenovo-crm':'web-crm')})})
  .then(function(r){ return r.json(); }).then(function(j){
    if(j.ok){ TOK=j.token; try{ localStorage.setItem('crm_tok',TOK); }catch(e){} enterApp(); } else { toast(j.error||'Invalid PIN'); }
  }).catch(function(){ toast('Network error'); });
}

function doSetup(){
  var a=document.getElementById('npin').value, b=document.getElementById('npin2').value;
  if(!a||!b){ toast('Enter and confirm your new PIN'); return; }
  req(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'setupPin',setupToken:SETUP,pin:a,confirmPin:b,deviceLabel:navigator.userAgent.indexOf('iPhone')>-1?'iphone-setup':(navigator.userAgent.indexOf('Lenovo')>-1?'lenovo-setup':'web-setup')})})
  .then(function(r){ return r.json(); }).then(function(j){
    if(j.ok){ TOK=j.token; try{ localStorage.setItem('crm_tok',TOK); }catch(e){} SETUP=''; toast('PIN set — you are in'); enterApp(); } else { toast(j.error||'Setup failed'); }
  }).catch(function(){ toast('Network error'); });
}

function enterApp(){
  hide('login'); hide('setup'); unhide('app'); unhide('nav'); killStatic();
  show('today');
}
function killStatic(){ try{ document.getElementById('static').style.display='none'; }catch(e){} }

function show(v){
  V=v;
  var btns=document.querySelectorAll('.nav button');
  for(var i=0;i<btns.length;i++) btns[i].className = btns[i].getAttribute('data-v')===v ? 'on' : '';
  var el=document.getElementById('view');
  if(v==='today') loadToday(el);
  if(v==='search') renderSearch(el);
  if(v==='add') renderAdd(el);
  if(v==='more') renderMore(el);
}

function jsLocLine(rt){ var m=String(rt||'').match(/Possibly lives in[^/]*/i); return m?m[0].trim():''; }
function jsPhoneLinks(phone,color){ var parts=String(phone||'').split(/\s*(?:\/|,|;|&| and )\s*/i).map(function(s){return s.trim();}).filter(Boolean); return parts.map(function(p){ var d=p.replace(/[^0-9+]/g,''); return '<a href="tel:'+d+'" style="color:'+color+'">'+esc(p)+'</a>'; }).join(' &#183; '); }
function tierBadge(t){ var cls='b-def'; if(t==='due_commitment')cls='tier-due_commitment'; else if(t==='fresh_never_contacted')cls='tier-fresh_never_contacted'; else if(t==='active_pipeline')cls='tier-active_pipeline'; else if(t==='re_engagement')cls='tier-re_engagement'; else if(t==='stale_dead')cls='tier-stale_dead'; return '<span class="badge '+cls+'">'+esc(t).replace(/_/g,' ')+'</span>'; }

function loadToday(el){
  el.innerHTML='<div class="spin">Building today’s priority queue…</div>';
  api('queue',{size:SIZE}).then(function(d){
    document.getElementById('whoami').textContent=d.actor;
    document.getElementById('sync').textContent='5-tier priority · your '+d.queue.length+' best · '+new Date(d.generatedAt).toLocaleTimeString();
    var st=d.stats.byTier||{};
    var h='<div class="card" style="padding:10px"><div class="mut" style="margin-bottom:6px">HOW MANY PEOPLE ARE YOU CONTACTING TODAY?</div>'
      +'<div style="display:flex;gap:8px">'
      +'<input id="sz" type="number" inputmode="numeric" value="'+SIZE+'" style="width:30%;text-align:center;font-weight:bold">'
      +'<button style="flex:1;background:var(--gold);color:#111;font-weight:700;border:none;border-radius:10px;padding:11px;font-size:13px" onclick="regen()">GENERATE MY LIST</button>'
      +'</div></div>';
    if(FIRSTRUN){ h+='<div class="card" style="border-color:var(--gold)"><div class="mut" style="margin-bottom:4px">SECURITY STEP</div><div class="sm" style="margin-bottom:10px">No PIN is set yet — anyone with this link can open your CRM. Set your PIN now to lock it back down.</div><button onclick="hide(\'app\');hide(\'nav\');unhide(\'setup\')">SET MY PIN NOW</button></div>'; }
    h+='<div class="chips">'
      +'<span class="chip">⚠ Due commitments: '+(st.due_commitment||0)+'</span>'
      +'<span class="chip">💡 Fresh: '+(st.fresh_never_contacted||0)+'</span>'
      +'<span class="chip">📈 Active: '+(st.active_pipeline||0)+'</span>'
      +'<span class="chip">🔁 Re-engage: '+(st.re_engagement||0)+'</span>'
      +'<span class="chip">🚫 Stale: '+(st.stale_dead||0)+'</span></div>';
    if(!d.queue.length) h+='<div class="card mut">Nothing queued. Add a contact or check back after the next sync.</div>';
    for(var i=0;i<d.queue.length;i++){
      var q=d.queue[i];
      var locg=jsLocLine(q.relationshipType);
      h+='<div class="card tap" onclick="openRecord(&#39;contact&#39;,&#39;'+q.id+'&#39;)">'
        +'<div class="row"><div class="name">'+esc(q.fullName||'(unnamed)')+'</div><div>'+tierBadge(q.prospectTier)+'</div></div>'
        +(q.phone?'<div class="sm" style="margin-top:4px">📞 '+jsPhoneLinks(q.phone,'inherit')+'</div>':'')
        +'<div class="sm" style="margin-top:6px;color:var(--gold)">➤ '+esc(q.nextAction||'')+'</div>'
        +'<div class="mut" style="margin-top:4px">'+esc(q.whyNow||'')+'</div>'
        +(locg?'<div class="sm" style="margin-top:4px;color:var(--purple)">📍 '+esc(locg)+'</div>':'')
        +'</div>';
    }
    el.innerHTML=h;
  }).catch(function(e){ el.innerHTML='<div class="card">'+esc(e)+'<div style="height:10px"></div><button class="ghost" onclick="show(&#39;today&#39;)">RETRY</button></div>'; });
}

function regen(){
  var v=parseInt(document.getElementById('sz').value,10);
  if(!v||v<1||v>100){ toast('Enter a number between 1 and 100'); return; }
  SIZE=v;
  try{ localStorage.setItem('crm_n',String(SIZE)); }catch(e){}
  loadToday(document.getElementById('view'));
}
function renderSearch(el){
  el.innerHTML='<div class="card"><input id="q" placeholder="Search people, businesses, phone, email…" onkeydown="if(event.key===&#39;Enter&#39;)runSearch()"><div style="height:10px"></div><button onclick="runSearch()">SEARCH</button></div><div id="sres"></div>';
  var q=document.getElementById('q'); q.focus();
}
function runSearch(){
  var q=document.getElementById('q').value.trim();
  var el=document.getElementById('sres');
  if(!q){ toast('Type something to search'); return; }
  el.innerHTML='<div class="spin">Searching…</div>';
  api('search',{q:q}).then(function(d){
    var h='';
    if(d.contacts.length){
      h+='<div class="mut" style="margin:4px 2px">PEOPLE</div>';
      for(var i=0;i<d.contacts.length;i++){ var c=d.contacts[i];
        h+='<div class="card tap" onclick="openRecord(&#39;contact&#39;,&#39;'+c.id+'&#39;)"><div class="row"><div class="name">'+esc(c.name)+'</div><div>'+tierBadge(c.status)+'</div></div><div class="mut sm">'+esc(c.pipeline)+(c.phone?' · '+esc(c.phone):'')+(c.nextFollowUpDate?' · follow up '+esc(c.nextFollowUpDate):'')+'</div></div>';
      }
    }
    if(d.prospects.length){
      h+='<div class="mut" style="margin:10px 2px 4px">BUSINESSES (EC City)</div>';
      for(var j=0;j<d.prospects.length;j++){ var p=d.prospects[j];
        h+='<div class="card tap" onclick="openRecord(&#39;prospect&#39;,&#39;'+p.id+'&#39;)"><div class="row"><div class="name">'+esc(p.name)+'</div><span class="badge b-def">'+esc(p.stage)+'</span></div><div class="mut sm">'+(p.rating?('⭐ '+p.rating):'')+(p.meetingDate?(' · meeting '+esc(p.meetingDate)):'')+'</div></div>';
      }
    }
    el.innerHTML=h||'<div class="card mut">No matches for “'+esc(q)+'”</div>';
  }).catch(function(e){ toast(String(e)); });
}

var CURRENT=null;
function openRecord(type,id){
  var el=document.getElementById('view');
  el.innerHTML='<div class="spin">Loading…</div>';
  api('record',{type:type,id:id}).then(function(d){
    CURRENT={type:type,record:d.record};
    if(type==='prospect') renderProspect(el,d.record); else renderContact(el,d.record,d.relatedProspect);
  }).catch(function(e){ el.innerHTML='<div class="card">'+esc(e)+'</div>'; });
}

function renderContact(el,c,rp){
  var r=c;
  var h='<div class="card">'
    +'<div class="row"><div class="name" style="font-size:20px">'+esc(r.fullName||'(unnamed)')+'</div><div>'+tierBadge(r.contactStatus)+'</div></div>'
    +'<div class="chips">'+(r.pipelines?'<span class="chip">'+esc(r.pipelines)+'</span>':'')+(r.relationshipType?'<span class="chip">'+esc(r.relationshipType)+'</span>':'')+(r.sheetRowNumber?'<span class="chip">List row '+esc(r.sheetRowNumber)+'</span>':'')+'</div>'
    +(r.phone?'<div style="display:block;text-align:center;margin:8px 0;background:var(--green);color:#111;font-weight:700;border-radius:10px;padding:12px">📞 '+jsPhoneLinks(r.phone,'#111')+'</div>':'')
    +(r.email?'<div class="sm">📧 <a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a></div>':'')
    +(r.address?'<div class="sm mut" style="margin-top:4px">📍 '+esc(r.address)+'</div>':'')
    +(rp?'<div class="sm" style="margin-top:8px">🏢 Business: <a href="#" onclick="openRecord(&#39;prospect&#39;,&#39;'+rp.id+'&#39;);return false">'+esc(rp.businessName)+'</a> — '+esc(rp.pipelineStage)+'</div>':'')
    +'<div class="kv">'
    +'<div class="box"><div class="l">Next action</div><div class="v">'+esc(r.nextAction||'—')+'</div></div>'
    +'<div class="box"><div class="l">Follow up</div><div class="v">'+esc(r.nextFollowUpDate||'—')+'</div></div>'
    +'<div class="box"><div class="l">Last interaction</div><div class="v">'+esc(r.lastInteractionDate||'never')+'</div></div>'
    +'<div class="box"><div class="l">Quoted / value</div><div class="v">'+esc(r.quotedPrice||'—')+' / '+esc(r.opportunityValue||'—')+'</div></div>'
    +'</div></div>'
    +'<div class="card"><div class="mut" style="margin-bottom:6px">NOTES & HISTORY</div><div class="notes" id="nt">'+esc(r.notes||'No notes yet.')+'</div>'
    +'<label>Add note</label><textarea id="ntext" placeholder="What happened on this touch?"></textarea><div style="height:10px"></div><button onclick="saveNote()">SAVE NOTE</button>'
    +'<div style="margin-top:8px"><a href="?log='+r.id+'" style="font-size:12px;font-weight:bold;color:var(--blue);text-decoration:none">&#9998; OR LOG THE CALL OUTCOME (updates CRM + Google Sheet) &#8594;</a></div></div>'
    +'<div class="card"><div class="mut" style="margin-bottom:4px">UPDATE STATUS & FOLLOW-UP</div>'
    +'<label>Status</label><select id="ust">'
    +['due_commitment','fresh_never_contacted','active_pipeline','re_engagement','stale_dead'].map(function(s){ return '<option '+(r.contactStatus===s?'selected':'')+'>'+s+'</option>'; }).join('')
    +'</select>'
    +'<label>Next action</label><input id="una" value="'+esc(r.nextAction||'')+'">'
    +'<label>Follow-up date (M/D/YY)</label><input id="ufu" value="'+esc(r.nextFollowUpDate||'')+'">'
    +'<div style="height:10px"></div><button onclick="saveStatus()">SAVE CHANGES</button></div>'
    +'<button class="ghost" onclick="show(&#39;today&#39;)">← BACK TO TODAY</button>';
  el.innerHTML=h;
}

function renderProspect(el,p){
  var h='<div class="card">'
    +'<div class="row"><div class="name" style="font-size:20px">'+esc(p.businessName||'(unnamed)')+'</div><span class="badge b-def">'+esc(p.pipelineStage)+'</span></div>'
    +'<div class="chips">'+(p.industry?'<span class="chip">'+esc(p.industry)+'</span>':'')+(p.rating?'<span class="chip">⭐ '+esc(p.rating)+(p.reviewCount?' · '+esc(p.reviewCount)+' reviews':'')+'</span>':'')+(p.websiteStatus?'<span class="chip">Site: '+esc(p.websiteStatus)+'</span>':'')+'</div>'
    +(p.phone?'<div style="display:block;text-align:center;margin:8px 0;background:var(--green);color:#111;font-weight:700;border-radius:10px;padding:12px">📞 '+jsPhoneLinks(p.phone,'#111')+'</div>':'')
    +(p.contactName?'<div class="sm">👤 '+esc(p.contactName)+(p.contactEmail?' · '+esc(p.contactEmail):'')+'</div>':'')
    +'<div class="kv">'
    +'<div class="box"><div class="l">Meeting</div><div class="v">'+esc(p.meetingDate||'—')+'</div></div>'
    +'<div class="box"><div class="l">Offer</div><div class="v">'+esc(p.offerPrice||'—')+'</div></div>'
    +(p.demoSiteUrl?'<div class="box"><div class="l">Demo site</div><div class="v"><a target="_blank" href="'+esc(p.demoSiteUrl)+'">Open</a></div></div>':'')
    +'</div></div>'
    +'<div class="card"><div class="mut" style="margin-bottom:6px">NOTES & HISTORY</div><div class="notes">'+esc(p.notes||'No notes yet.')+'</div>'
    +'<label>Add note</label><textarea id="ntext" placeholder="Call outcome, next step…"></textarea><div style="height:10px"></div><button onclick="saveNote()">SAVE NOTE</button></div>'
    +'<div class="card"><label>Pipeline stage</label><select id="ust">'
    +['researching','qualified','outreach_sent','replied','meeting_booked','won','lost'].map(function(s){ return '<option '+(p.pipelineStage===s?'selected':'')+'>'+s+'</option>'; }).join('')
    +'</select><label>Meeting date</label><input id="una" value="'+esc(p.meetingDate||'')+'"><div style="height:10px"></div><button onclick="saveProspect()">SAVE CHANGES</button></div>'
    +'<button class="ghost" onclick="show(&#39;today&#39;)">← BACK TO TODAY</button>';
  el.innerHTML=h;
}

function saveNote(){
  var t=document.getElementById('ntext').value.trim();
  if(!t){ toast('Write a note first'); return; }
  api('addNote',{type:CURRENT.type,id:CURRENT.record.id,text:t}).then(function(){
    openRecord(CURRENT.type,CURRENT.record.id); toast('Note saved');
  }).catch(function(e){ toast(String(e)); });
}
function saveStatus(){
  var b={id:CURRENT.record.id,contactStatus:document.getElementById('ust').value,nextAction:document.getElementById('una').value,nextFollowUpDate:document.getElementById('ufu').value,touchedInteraction:'true'};
  api('updateContact',b).then(function(){ toast('Saved'); openRecord('contact',CURRENT.record.id); }).catch(function(e){ toast(String(e)); });
}
function saveProspect(){
  var b={id:CURRENT.record.id,pipelineStage:document.getElementById('ust').value,meetingDate:document.getElementById('una').value};
  api('updateProspect',b).then(function(){ toast('Saved'); openRecord('prospect',CURRENT.record.id); }).catch(function(e){ toast(String(e)); });
}

function renderAdd(el){
  el.innerHTML='<div class="card"><div class="mut" style="margin-bottom:4px">NEW PERSON / BUSINESS</div>'
    +'<label>Full name *</label><input id="an">'
    +'<label>Phone</label><input id="ap" inputmode="tel">'
    +'<label>Email</label><input id="ae" inputmode="email">'
    +'<label>Business (optional)</label><input id="ab">'
    +'<label>Pipeline / segment</label><input id="api" placeholder="Amway, EC City, New…">'
    +'<label>First note</label><textarea id="ant"></textarea>'
    +'<div style="height:12px"></div><button onclick="createC()">ADD TO CRM</button></div>';
}
function createC(){
  var n=document.getElementById('an').value.trim();
  if(!n){ toast('Name is required'); return; }
  api('createContact',{fullName:n,phone:document.getElementById('ap').value.trim(),email:document.getElementById('ae').value.trim(),businessName:document.getElementById('ab').value.trim(),pipelines:document.getElementById('api').value.trim(),notes:document.getElementById('ant').value.trim()}).then(function(d){
    toast('Added'); document.getElementById('an').value=''; openRecord('contact',d.id);
  }).catch(function(e){ toast(String(e)); });
}

function renderMore(el){
  el.innerHTML='<div class="card"><div class="mut" style="margin-bottom:4px">YOUR DATA — PORTABLE, ALWAYS</div>'
    +'<div class="sm" style="margin-bottom:10px">Everything below downloads the complete CRM. No lock-in: use it in Sheets, Excel, or any other system.</div>'
    +'<button onclick="dl(&#39;json&#39;)">💾 EXPORT EVERYTHING (JSON)</button><div style="height:8px"></div>'
    +'<button class="ghost" onclick="dl(&#39;csv&#39;)">📊 EXPORT CONTACTS (CSV)</button></div>'
    +'<div class="card"><div class="mut" style="margin-bottom:4px">SESSION</div><div class="sm">Same PIN and session system as Mission Control. Your data lives in your Base44 account and in every export you take.</div><div style="height:10px"></div><button class="ghost" onclick="localStorage.removeItem(&#39;crm_tok&#39;);location.reload()">LOG OUT</button></div>';
}
function dl(kind){
  req(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOK},body:JSON.stringify({op:kind==='csv'?'exportCsv':'export'})}).then(function(r){
    return kind==='csv' ? r.text() : r.json();
  }).then(function(data){
    var txt = kind==='csv' ? data : JSON.stringify(data,null,2);
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([txt],{type:kind==='csv'?'text/csv':'application/json'}));
    a.download=kind==='csv'?('vantra-crm-contacts-'+new Date().toISOString().slice(0,10)+'.csv'):('vantra-crm-full-'+new Date().toISOString().slice(0,10)+'.json');
    document.body.appendChild(a); a.click(); a.remove();
    toast('Export downloaded');
  }).catch(function(){ toast('Export failed'); });
}

var SETUP='';
var SIZE=10;
try{ SIZE = Math.max(1, Math.min(100, parseInt(localStorage.getItem('crm_n'),10)||10)); }catch(e){ SIZE=10; }
var FIRSTRUN = (document.body.getAttribute('data-pinset')==='0');
var DTOK = document.body.getAttribute('data-tok') || '';
if(DTOK && !TOK){ TOK = DTOK; try{ localStorage.setItem('crm_tok',TOK); }catch(e){} }
var su = location.search.match(/[?&]setup=([A-Za-z0-9_-]{20,})/);
if(su){ SETUP=su[1]; hide('login'); unhide('setup'); try{ history.replaceState(null,'',location.pathname); }catch(e){} }
else if(TOK){ enterApp(); }
else if(FIRSTRUN){
  req(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'firstRun',deviceLabel:navigator.userAgent.indexOf('iPhone')>-1?'iphone-first-run':(navigator.userAgent.indexOf('Lenovo')>-1?'lenovo-first-run':'web-first-run')})})
  .then(function(r){ return r.json(); }).then(function(j){
    if(j.ok){ TOK=j.token; try{ localStorage.setItem('crm_tok',TOK); }catch(e){} enterApp(); } else { toast(j.error||'Could not open'); }
  }).catch(function(){ toast('Network error'); });
}
else { unhide('login'); killStatic(); }
setTimeout(function(){ toast('App ready'); },400);
document.getElementById('pin').addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
document.getElementById('npin').addEventListener('keydown',function(e){ if(e.key==='Enter'){ if(document.getElementById('npin2').value){ doSetup(); } else { document.getElementById('npin2').focus(); } } });
document.getElementById('npin2').addEventListener('keydown',function(e){ if(e.key==='Enter') doSetup(); });
</script>
</body>
</html>`;
}

const crmHandler = async (req: Request): Promise<Response> => {
// [loader pattern Oct 6 2026] handler exported so the deployed shim can serve it
  const uq = new URL(req.url).searchParams;
if (req.method === "POST" || uq.get("op")) return handleFormPost(req);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  let db: any = null;
  try { const base44: any = createClientFromRequest(req); db = base44.asServiceRole; } catch { db = null; }

  let pinSet = true, authed = false, tokPlain = "", err = "";
  try {
    const cfg = db ? await db.entities.McConfig.list() : [];
    pinSet = cfg && cfg.length ? !!cfg[0].pinHash : true;
    const ck = (req.headers.get("Cookie") || "").match(/crm_tok=([A-Za-z0-9_-]+)/);
    if (ck) {
      const h = await sha256hex(ck[1]);
      const sess = db ? await db.entities.McSession.filter({ token: h }) : [];
      if (sess && sess.length) {
        const s0 = sess[0];
        if (s0.expiresAt && s0.expiresAt > new Date().toISOString()) { authed = true; tokPlain = ck[1]; }
      }
    }
    const q = new URL(req.url).searchParams.get("err");
    if (q) err = q;
  } catch { /* fall through with defaults */ }

  // SCRIPT LIBRARY (Oct 6, 2026): live script list into the popup on the main page and log pages.
  let scripts: any[] = [];
  try { scripts = db ? await fetchScripts(db) : []; } catch { scripts = []; }
  const widgetScripts = (authed || !pinSet) ? scripts : []; // never leak saved scripts before unlock
  const Wmain14 = scriptWidgetHtml(14, publicPath(req), widgetScripts);

  const apiUrl = new URL(req.url);
  apiUrl.pathname = apiUrl.pathname.replace(/crmApp.*/, "crmApi");
  apiUrl.search = "";

  // "Report what happened" flow: ?log=<contactId> shows the outcome form
  const logId = new URL(req.url).searchParams.get("log");
  if (logId && db) {
    const sess2 = await (async () => { try { const ck = (req.headers.get("Cookie") || "").match(/crm_tok=([A-Za-z0-9_-]+)/); if (!ck) return null; const h = await sha256hex(ck[1]); const ss = await db.entities.McSession.filter({ token: h }); if (!ss || !ss.length) return null; const s0 = ss[0]; if (s0.expiresAt && s0.expiresAt < new Date().toISOString()) return null; return s0; } catch { return null; } })();
    const formAction = publicPath(req);
    if (!sess2 && pinSet) {
      const html = pageShell(staticForm("", "login", "Enter your PIN to log an outcome.") );
      return new Response(html, { headers });
    }
    const recs = await db.entities.MasterContact.filter({ id: logId });
    if (recs && recs.length) {
      const theirNameQ = (new URL(req.url).searchParams.get("theirName") || "").trim().substring(0, 60);
      const c0 = recs[0];
      const logFormHtml = splitPhoneNumbers(String(c0.phone || "")).length > 1
        ? staticMultiLogForm(formAction, c0, todayEtStr(), "")
        : staticLogForm(formAction, c0, todayEtStr(), "");
      const html = pageShell(pivotSection(formAction, c0, theirNameQ) + logFormHtml + '<div><a href="' + formAction + '" style="color:#8b8b9e;font-size:13px">&#8592; BACK TO MY LIST</a></div>', Wmain14);
      return new Response(html, { headers });
    }
    const html = pageShell('<div style="color:#8b8b9e">Contact not found.</div><div style="margin-top:8px"><a href="' + formAction + '" style="color:#60a5fa">Back to my list</a></div>');
    return new Response(html, { headers });
  }

  let staticInner = "";
  let headersForCookie = "";
  try {
    const showList = authed || !pinSet; // link-as-key: while no PIN is set, the unguessable URL is the credential
    if (!pinSet) {
      staticInner += '<div style="text-align:center;color:#fbbf24;font-size:13px;margin-bottom:10px">OPEN MODE (v3.3) — set your PIN below to lock your CRM. Keep this link private until then.</div>';
      staticInner += staticForm("", "setup", err);
    } else if (!authed) {
      staticInner += staticForm("", "login", err);
    }
    if (showList && db) {
      const regen = !!new URL(req.url).searchParams.get("n");
      const rl = await renderSessionList(db, req, regen);
      staticInner += rl.html;
      if (rl.cookie) headersForCookie = rl.cookie;
    } else if (!showList) {
      staticInner += '<div style="color:#8b8b9e;font-size:13px">Open the app to continue.</div>';
    }
  } catch {
    staticInner += '<div style="color:#8b8b9e;font-size:13px">Loading issue — refresh in a moment.</div>';
  }

  const html = buildHtml(staticInner, pinSet ? "1" : "0", authed ? tokPlain : "", scriptWidgetHtml(78, publicPath(req), widgetScripts));
  const finalHeaders: Record<string, string> = { ...headers };
  if (headersForCookie) finalHeaders["Set-Cookie"] = headersForCookie;
  return new Response(html, { headers: finalHeaders });
;
};
export default crmHandler;