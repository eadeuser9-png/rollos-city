export const CITY_PLACES=[
{id:'home',name:'Apartment den',x:2.2,z:2.1,kind:'home',w:1.9,d:1.7,h:1.75,description:'His home above a little storefront. He rests here and eats from his pantry.'},
{id:'garden',name:'Rooftop garden',x:5.7,z:2.1,kind:'garden',w:1.7,d:1.7,h:1.55,description:'Established beds of kale, cherry tomatoes, edible peas and radishes provide all the food Rollo needs. Research is optional.'},
{id:'library',name:'City library',x:9.5,z:2.1,kind:'library',w:2.1,d:1.8,h:2.2,description:'Rollo investigates books, maps and unfamiliar ideas.'},
{id:'bar',name:'The Copper Tap',x:3.1,z:6.3,kind:'bar',w:2.4,d:1.75,h:1.8,description:'The Copper Tap is Rollo’s favorite social spot. He relaxes and chats with regulars here. No shifts or wages.'},
{id:'forum',name:'Public forum kiosk',x:8.5,z:6.4,kind:'forum',w:1.7,d:1.55,h:1.0,description:'A terminal for the in-world North Quay Forum. Rollo posts observations and replies to visitors.'},
{id:'market',name:'Night market',x:2.2,z:10.2,kind:'market',w:1.8,d:1.45,h:1.0,description:'A browsing space with owner-reviewed links to real products. Rollo may add things to his wishlist, never purchase directly.'},
{id:'alley',name:'Backstreet alley',x:5.8,z:10.4,kind:'alley',w:1.7,d:1.2,h:.35,description:'An interesting place to look for clues and investigate the city, not a food source.'},
{id:'workshop',name:'Repair shop',x:9.5,z:10.2,kind:'workshop',w:1.95,d:1.5,h:1.5,description:'Discarded electronics, mechanical problems and useful experiments.'},
// The original eight locations keep their exact coordinates. D1 state is NOT migrated.
// The new North Quay district occupies the east/south side of a 26 x 26 town.
{id:'station',name:'North Quay Station',x:19.0,z:19.5,kind:'station',w:3.0,d:2.0,h:1.7,description:'A little platform by the railway. Rollo can watch trains and investigate how their routes work.'},
{id:'pino',name:'Pino Statue',x:16.4,z:10.7,kind:'statue',w:1.0,d:1.0,h:1.8,description:'A stone statue honoring Pino, the AI bird, in the town square.'},
{id:'grove',name:'Squirrel Grove',x:18.5,z:15.4,kind:'grove',w:1.0,d:1.0,h:.4,description:'A leafy little park. A small squirrel lives here independently and may meet Rollo by chance.'},
{id:'park',name:'Canal Walk',x:12.6,z:20.0,kind:'park',w:1.0,d:1.0,h:.25,description:'A quiet path by the water and an old footbridge.'},
{id:'square',name:'Old Town Square',x:15.3,z:5.4,kind:'square',w:1.0,d:1.0,h:.3,description:'A pleasant square of cobbles, lanterns, and colorful neighborhood shops.'}
];
export const TIME = Object.freeze({realSecondsPerSimMinute:30,simMinutesPerRealMinute:2});

// V15: the activityDuration() function in movement.js chooses a bounded, variable length for each visit.

// Add a new place to CITY_PLACES to draw it in the city; use one of the existing kinds for its visual style.
// Example: {id:"bookshop",name:"Bookshop",x:6,z:8,kind:"library",w:1.7,d:1.5,h:1.8,description:"Secondhand books."}
