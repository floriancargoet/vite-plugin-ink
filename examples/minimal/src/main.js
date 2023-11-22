import story from "./story.ink";

const storyContainer = document.querySelector("#story");

// Setup hot-reloading.
// Store choices to replay them after hot-reloading
let choiceSequenceToRecord = [];
if (import.meta.hot) {
  import.meta.hot.accept("./story.ink", (module) => {
    if (!module) return;
    const newStory = module.default;
    const choiceSequenceToReplay = [...choiceSequenceToRecord];
    choiceSequenceToRecord = []; // Reset since this new run will fill it again
    storyContainer.innerHTML = "";
    continueStory(newStory, choiceSequenceToReplay);
  });
}

// Start the story
continueStory(story, []);

function continueStory(story, choiceSequenceToReplay) {
  while (story.canContinue) {
    const paragraphText = story.Continue() ?? "";
    const p = document.createElement("p");
    p.innerHTML = paragraphText;
    storyContainer.append(p);
  }

  let createPlayableChoices = true;
  if (choiceSequenceToReplay.length > 0) {
    createPlayableChoices = false;
    try {
      const index = choiceSequenceToReplay.shift();
      story.ChooseChoiceIndex(index);
      choiceSequenceToRecord.push(index);
      continueStory(story, choiceSequenceToReplay);
    } catch (e) {
      // The structure has changed to much to replay choices, we resume normal game from here
      console.log("Failed to replay all choices");
      const warning = document.createElement("p");
      warning.style.color = "orange";
      warning.innerHTML =
        "The choice to replay could not be found. Resuming normal game…";
      storyContainer.append(warning);
      createPlayableChoices = true;
    }
  }
  if (createPlayableChoices) {
    for (const choice of story.currentChoices) {
      const p = document.createElement("p");
      p.classList.add("choice");
      p.innerHTML = `<a href='#' class="choice">${choice.text}</a>`;
      p.firstChild?.addEventListener("click", (ev) => {
        ev.preventDefault();
        story.ChooseChoiceIndex(choice.index);
        choiceSequenceToRecord.push(choice.index);
        storyContainer.querySelectorAll(".choice").forEach((c) => c.remove());
        continueStory(story, []);
      });
      storyContainer.append(p);
    }
  }
}
