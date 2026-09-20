This week I built the first working version of Resolve UK. You can try it yourself on the Progress page. Open it on a phone, report a problem with a photo and a location, and it appears in a list with its status.

Everything so far comes from my own reading of the pitch deck, not from a process you've confirmed. The reporting loop (send in a problem, see what happened to it) works whichever way the rest turns out, so it was a safe place to start. Before I build further into routing and fixes, I'd like to understand how you expect those parts to work. My questions are at the end.

## What I built

Four things are in place.

- It works like an app on a phone. Open the website, choose "Add to Home Screen", and it sits alongside your other apps. There's nothing to download from an app store.
- Reports are stored safely online. Each report and its photo are saved on a secure hosted service, so nothing is lost when the phone is closed.
- There's a form for reporting a problem. You choose the type (fly-tipping, pothole or other), write a short description, add a photo, and mark where it is, either with the phone's location or by placing a pin on a map.
- There's a list of reports. Everything submitted shows up with its photo, type and status. For now every report says "Reported", because no council is connected yet to update it.

## What comes next

I see five stages, building outward from this first one towards the platform described in the pitch deck.

1. Reporting basics. This is what you can try today.
2. A feed instead of a list. Each report would be shown like a post on a social timeline, with the outcome beside it once there is one, so you see the problem and the fix together. I'd also add a light way for people to see their own reports without a full login, and let a report sent with no signal go through once the signal returns.
3. AI help with sorting. The app would suggest the type of problem from the photo, and how urgent it looks, instead of relying on the dropdown.
4. Sending reports to the right council, and checking fixes. Reports go to the responsible local authority, and AI helps confirm that a fix really happened before a report is marked resolved.
5. Public dashboards. Comparable performance measures for councils, and access for councils, housing associations and waste operators.

## Things to be aware of

These are the trade-offs I made to move quickly this week, roughly in order of importance. None of them stops me continuing, but they're worth deciding on deliberately before this becomes a pilot.

- Reports are public and there's no login. Anyone who opens the app sees every report, not just their own, and anyone with the link can submit one. That's fine for testing, but access needs to be controlled properly before wider use.
- The app needs an internet connection. Being installable doesn't mean it works offline. It can't send or show reports without a signal, which matters in places like rural fly-tipping spots. Fixing that means saving reports on the phone and sending them later, and I plan to do it in stage 2.
- I haven't decided where the data should live. The database was set up in whichever region was quickest, which isn't necessarily the UK or EU. Moving it later means rebuilding it, so this should be settled before any real citizen data is collected.
- The prototype is on a free hosting plan. It's fine for a prototype, but it pauses after a week of inactivity and has limits on storage and traffic. A pilot with real users will need a paid plan.
- Nobody checks the photos. Once reports are visible to others, and especially once the feed becomes the main view, inappropriate, duplicate or irrelevant photos become a real question. Storage cost grows with volume too.
- Placing a pin by hand is less exact than GPS. If someone declines to share their location they tap the map instead. That works for now, but it will matter once a report has to be matched to the right council's boundary.
- The status never moves on from "Reported". That's intentional at this stage, because no council is connected yet to update it. I'm mentioning it so it isn't mistaken for a fault.

## Questions I asked

You replied on 19 and 20 September, and your answers are reflected in the Blueprint and on the Decisions page. For the record, these are the five questions I asked.

1. How should a report reach the people who act on it: a dashboard checked by hand, or a link into a system a council already uses?
2. Who deals with these reports today, and is there an existing process or contact I should work with?
3. What counts as resolved, and who decides?
4. Is there a specific council or area I should design the first version around?
5. Are there existing commitments about how data is handled that I need to follow?
