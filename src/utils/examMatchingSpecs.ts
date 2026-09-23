/** Explicit exam-only presentation repairs. Source answer keys and field IDs stay unchanged. */
export interface ExamMatchingSpec {
  groupId: string
  kind: 'people' | 'endings'
  questionIds: string[]
  options: { value: string; label: string }[]
  statements: { questionId: string; text: string }[]
  allowOptionReuse: boolean
  instruction: string
  poolTitle: string
}

// Labels follow the source lists. Missing letters were checked against the bundled PDFs:
// Pacific Navigation (79), Crossing the Threshold (63), fluoridation (88),
// learning an instrument (86), and multitasking (90).
// The mixed multitasking record targets q1–q5 only; its remaining questions are untouched.
export const EXAM_MATCHING_SPECS: Record<string, ExamMatchingSpec> = {
  "p2-low-135": {
    "groupId": "group-3",
    "kind": "people",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Dickson Despommier"
      },
      {
        "value": "B",
        "label": "B Ted Yamanoko"
      },
      {
        "value": "C",
        "label": "C Natalie Jeremijenko"
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "Vertical farming can have financial benefits."
      },
      {
        "questionId": "q11",
        "text": "Traditional farming has had a negative effect on the natural world."
      },
      {
        "questionId": "q12",
        "text": "Vertical farming could dramatically increase world food production."
      },
      {
        "questionId": "q13",
        "text": "Traditional farms may benefit from wider use of vertical farming."
      }
    ],
    "allowOptionReuse": true,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p1-low-35": {
    "groupId": "group-1",
    "kind": "people",
    "questionIds": [
      "q1",
      "q2",
      "q3",
      "q4"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Bill Phillips-Turner"
      },
      {
        "value": "B",
        "label": "B Mike Berwick"
      },
      {
        "value": "C",
        "label": "C Karen Benn"
      },
      {
        "value": "D",
        "label": "D Brian Roberts"
      },
      {
        "value": "E",
        "label": "E Tom Watters"
      },
      {
        "value": "F",
        "label": "F Doug Crees"
      }
    ],
    "statements": [
      {
        "questionId": "q1",
        "text": "Mossman cane-farming practices are close to an environmentally friendly model."
      },
      {
        "questionId": "q2",
        "text": "Financial return is not the only important factor for cane growers."
      },
      {
        "questionId": "q3",
        "text": "Cane sugar may not harm the environment as much as other crops do."
      },
      {
        "questionId": "q4",
        "text": "The local population would decline if the sugar-processing plant closed."
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p2-low-051": {
    "groupId": "group-2",
    "kind": "people",
    "questionIds": [
      "q8",
      "q9",
      "q10"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Stuart McKechnie"
      },
      {
        "value": "B",
        "label": "B Chris Johnson"
      },
      {
        "value": "C",
        "label": "C Lee Allen"
      },
      {
        "value": "D",
        "label": "D Mark Clifford"
      }
    ],
    "statements": [
      {
        "questionId": "q8",
        "text": "Dingoes tend to hunt native animals rather than hunting other non-native predators."
      },
      {
        "questionId": "q9",
        "text": "The presence of dingoes puts the income of some people at risk."
      },
      {
        "questionId": "q10",
        "text": "Dingoes have had little impact on the dying out of animal species in Australia."
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p3-low-158": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A something is thought to be worth more than it really is"
      },
      {
        "value": "B",
        "label": "B discussions between the parties begin to break down"
      },
      {
        "value": "C",
        "label": "C too much information is given to the other parties early on"
      },
      {
        "value": "D",
        "label": "D businesses consider possible future developments"
      },
      {
        "value": "E",
        "label": "E people allow their feelings to influence decisions"
      },
      {
        "value": "F",
        "label": "F a solution requires face-to-face negotiation"
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "According to Reinier van Oosten, game-theory software fails when"
      },
      {
        "questionId": "q11",
        "text": "Dr Milgrom's software is successful in detecting if"
      },
      {
        "questionId": "q12",
        "text": "Dr Black's game-theory software is a helpful tool when"
      },
      {
        "questionId": "q13",
        "text": "According to Dr Ponsatí, negotiators fall behind if"
      },
      {
        "questionId": "q14",
        "text": "Dr Ponsatí's mediation machine is useful when"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-high-170": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A was the variety of experimental techniques used"
      },
      {
        "value": "B",
        "label": "B was not of interest to young islanders today"
      },
      {
        "value": "C",
        "label": "C was not conclusive evidence in support of a single theory"
      },
      {
        "value": "D",
        "label": "D was being able to change their practices when necessary"
      },
      {
        "value": "E",
        "label": "E was the first time humans intentionally crossed an ocean"
      },
      {
        "value": "F",
        "label": "F was the speed with which it was conducted"
      }
    ],
    "statements": [
      {
        "questionId": "q11",
        "text": "One limitation in the information produced by all of this research is that it"
      },
      {
        "questionId": "q12",
        "text": "The best thing about this type of research"
      },
      {
        "questionId": "q13",
        "text": "The most important achievement of traditional navigators"
      },
      {
        "questionId": "q14",
        "text": "The migration of people from Asia to the Pacific"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-low-165": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A practice will always be more important than theory."
      },
      {
        "value": "B",
        "label": "B better trainers are the only answer."
      },
      {
        "value": "C",
        "label": "C more capable graduates could be attracted into the profession."
      },
      {
        "value": "D",
        "label": "D a teacher who is not outstanding can be improved."
      },
      {
        "value": "E",
        "label": "E the assistance of teachers' unions is essential."
      },
      {
        "value": "F",
        "label": "F a better syllabus and more practical involvement will improve results."
      }
    ],
    "statements": [
      {
        "questionId": "q11",
        "text": "Just as any athlete can be coached for better performance,"
      },
      {
        "questionId": "q12",
        "text": "If teachers are to be taught the complex skills they require,"
      },
      {
        "questionId": "q13",
        "text": "In teaching, as in the medical profession,"
      },
      {
        "questionId": "q14",
        "text": "If the status of teachers were improved,"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-high-161": {
    "groupId": "group-3",
    "kind": "people",
    "questionIds": [
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A a robot that makes use of light as well as stored images for navigational purposes"
      },
      {
        "value": "B",
        "label": "B a robot that can contribute to environmental health"
      },
      {
        "value": "C",
        "label": "C a robot that can move over difficult surfaces"
      },
      {
        "value": "D",
        "label": "D a robot that categorises information from the environment according to its usefulness"
      },
      {
        "value": "E",
        "label": "E a robot that can be used to clean surfaces and collect rubbish"
      },
      {
        "value": "F",
        "label": "F a robot that has improved on the ability of the insect on which it is based"
      },
      {
        "value": "G",
        "label": "G a robot that can replace soldiers in war"
      }
    ],
    "statements": [
      {
        "questionId": "q11",
        "text": "Dr Alex Zelinsky"
      },
      {
        "questionId": "q12",
        "text": "Professor Ruediger Wehner"
      },
      {
        "questionId": "q13",
        "text": "Professor Robert Michelson"
      },
      {
        "questionId": "q14",
        "text": "Roger Quinn and Professor Roy Ritzmann"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each person or people with the correct robot below.",
    "poolTitle": "List of Robots"
  },
  "p3-low-153": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A resulted in work being done in the opposite direction to that usually followed."
      },
      {
        "value": "B",
        "label": "B is more than cosmetic and has improved the circulation."
      },
      {
        "value": "C",
        "label": "C was the clue to rebuilding the Mackelvie Gallery successfully."
      },
      {
        "value": "D",
        "label": "D has resulted in the building itself becoming a work of art."
      },
      {
        "value": "E",
        "label": "E means that you should be able to tell whether you are in the old wing or the new one."
      },
      {
        "value": "F",
        "label": "F was the result of earlier attempts to modernise the building."
      }
    ],
    "statements": [
      {
        "questionId": "q11",
        "text": "The destruction of Edwardian ornamentation"
      },
      {
        "questionId": "q12",
        "text": "It is extraordinary that a limited number of photographs"
      },
      {
        "questionId": "q13",
        "text": "The problem of having so many floor levels to deal with"
      },
      {
        "questionId": "q14",
        "text": "The glass flooring in the Mackelvie Gallery which reveals old features"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-medium-183": {
    "groupId": "group-1",
    "kind": "people",
    "questionIds": [
      "q1",
      "q2",
      "q3",
      "q4",
      "q5"
    ],
    "options": [
      {
        "value": "A",
        "label": "A John Ridley Stroop"
      },
      {
        "value": "B",
        "label": "B Ernst Pöppel"
      },
      {
        "value": "C",
        "label": "C David E. Meyer"
      },
      {
        "value": "D",
        "label": "D Edward Hallowell & John Ratey"
      }
    ],
    "statements": [
      {
        "questionId": "q1",
        "text": "Less attention will be paid to each task when more than one task is attempted at the same time."
      },
      {
        "questionId": "q2",
        "text": "Repeated changes of task mean that the brain will take a while to adjust."
      },
      {
        "questionId": "q3",
        "text": "Using the skills required for one task may make performing another one more difficult."
      },
      {
        "questionId": "q4",
        "text": "When multitasking, the brain can only focus on single tasks for very short periods."
      },
      {
        "questionId": "q5",
        "text": "Multitasking can lead to a medical problem."
      }
    ],
    "allowOptionReuse": true,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p2-medium-146": {
    "groupId": "group-2",
    "kind": "people",
    "questionIds": [
      "q6",
      "q7",
      "q8",
      "q9",
      "q10",
      "q11"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Hans Naarding"
      },
      {
        "value": "B",
        "label": "B Randolph Rose"
      },
      {
        "value": "C",
        "label": "C David Pemberton"
      },
      {
        "value": "D",
        "label": "D Nick Mooney"
      }
    ],
    "statements": [
      {
        "questionId": "q6",
        "text": "There is no longer any hope of finding a surviving Tasmanian tiger."
      },
      {
        "questionId": "q7",
        "text": "It would be preferable not to disturb any surviving Tasmanian tigers."
      },
      {
        "questionId": "q8",
        "text": "Many who claim to have seen Tasmanian tigers are not objective witnesses."
      },
      {
        "questionId": "q9",
        "text": "Expert estimates of numbers needed to ensure species survival may be inaccurate."
      },
      {
        "questionId": "q10",
        "text": "There is a great deal of international interest in Tasmanian tiger stories."
      },
      {
        "questionId": "q11",
        "text": "Some fresh evidence provided by a visitor to Tasmania seems credible."
      }
    ],
    "allowOptionReuse": true,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p2-medium-058": {
    "groupId": "group-3",
    "kind": "people",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13"
    ],
    "options": [
      {
        "value": "A",
        "label": "A. Thomas Mendenhall"
      },
      {
        "value": "B",
        "label": "B. Ward Elliott and Robert Valenza"
      },
      {
        "value": "C",
        "label": "C. Professor Kate McCluskey"
      },
      {
        "value": "D",
        "label": "D. Dr Thomas Merriam"
      },
      {
        "value": "E",
        "label": "E. Dr Markus Dahl"
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "People search for a more distinguished author because they cannot accept that a normal individual could write such brilliant plays."
      },
      {
        "questionId": "q11",
        "text": "It should be possible to recognise writers by examining the number of letters in the words they use."
      },
      {
        "questionId": "q12",
        "text": "The fact that Shakespeare's works are likely to have been altered over the years raises doubts about any stylometric analysis."
      },
      {
        "questionId": "q13",
        "text": "Analysis proves that Shakespeare's style differs from those of writers who have been suggested as the authors of the plays."
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p3-low-172": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A the museum programme will lose its individuality."
      },
      {
        "value": "B",
        "label": "B the museum will lose credibility."
      },
      {
        "value": "C",
        "label": "C the art loses its importance."
      },
      {
        "value": "D",
        "label": "D it will have to balance opposing demands."
      },
      {
        "value": "E",
        "label": "E this will encourage museum visitors in the future."
      },
      {
        "value": "F",
        "label": "F it will have the capability of increasing revenue."
      },
      {
        "value": "G",
        "label": "G the architect's reputation might suffer."
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "If a large space is available in the museum,"
      },
      {
        "questionId": "q11",
        "text": "If children are allowed to move freely in parts of the gallery,"
      },
      {
        "questionId": "q12",
        "text": "If too much emphasis is placed on the museum building itself,"
      },
      {
        "questionId": "q13",
        "text": "If there is an over-reliance on 'blockbuster' exhibitions,"
      },
      {
        "questionId": "q14",
        "text": "If the NGV wants to continue to be successful,"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-high-180": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A the results of scientific research are not always understood at first."
      },
      {
        "value": "B",
        "label": "B science is an unbiased discipline."
      },
      {
        "value": "C",
        "label": "C people should be able to choose whether they want fluoride."
      },
      {
        "value": "D",
        "label": "D there is insufficient proof to support a cautious approach."
      },
      {
        "value": "E",
        "label": "E the serious damage fluoride causes far outweighs any positive effects."
      },
      {
        "value": "F",
        "label": "F children are not the only ones who benefit from fluoridation."
      },
      {
        "value": "G",
        "label": "G scientific knowledge is affected by the beliefs of everyone concerned."
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "The traditional view of science is that"
      },
      {
        "questionId": "q11",
        "text": "A sociological view of science argues that"
      },
      {
        "questionId": "q12",
        "text": "Collins is of the opinion that"
      },
      {
        "questionId": "q13",
        "text": "The writer suggests that a supporter of fluoridation may conclude that"
      },
      {
        "questionId": "q14",
        "text": "The writer suggests that an opponent of fluoridation may conclude that"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p2-low-222": {
    "groupId": "group-2",
    "kind": "people",
    "questionIds": [
      "q6",
      "q7",
      "q8",
      "q9"
    ],
    "options": [
      {
        "value": "A",
        "label": "A The choice of a certain construction material can have a socio‑economic impact."
      },
      {
        "value": "B",
        "label": "B Throughout the world, people are rejecting traditional housing design in order to appear modern."
      },
      {
        "value": "C",
        "label": "C Houses should not only meet people's physical needs but also their social and psychological needs."
      },
      {
        "value": "D",
        "label": "D Traditional knowledge can be superior to modern knowledge."
      },
      {
        "value": "E",
        "label": "E There is an innovation that can save costs on both air‑conditioning and heating."
      },
      {
        "value": "F",
        "label": "F Solar energy can meet the energy needs of people living in villages in developing countries."
      },
      {
        "value": "G",
        "label": "G There is a very simple solution that can save on the cost of air‑conditioning."
      }
    ],
    "statements": [
      {
        "questionId": "q6",
        "text": "Muhammad Peter Davis"
      },
      {
        "questionId": "q7",
        "text": "Arthur Rosenfeld"
      },
      {
        "questionId": "q8",
        "text": "R van der Ley"
      },
      {
        "questionId": "q9",
        "text": "Amory Lovins"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each person with the correct idea below.",
    "poolTitle": "List of Ideas"
  },
  "p3-high-159": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A reflect what life was like at that time."
      },
      {
        "value": "B",
        "label": "B help children deal with their problems."
      },
      {
        "value": "C",
        "label": "C demonstrate the outdated system."
      },
      {
        "value": "D",
        "label": "D tell of the simplicity of life in the German countryside."
      },
      {
        "value": "E",
        "label": "E encourage people to believe that they can do anything."
      },
      {
        "value": "F",
        "label": "F recognize the heroes in the real life."
      },
      {
        "value": "G",
        "label": "G contribute to the belief in nature's power."
      },
      {
        "value": "H",
        "label": "H avoid details about characters' social settings."
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "Heinz Rolleke said the Grimm's tales are \"German\" because some tales"
      },
      {
        "questionId": "q11",
        "text": "Heinz Rolleke said the abandoned children in tales"
      },
      {
        "questionId": "q12",
        "text": "Bernhard Lauer said the writing style of the Grimm brothers is universal because they"
      },
      {
        "questionId": "q13",
        "text": "Jack Zipes said the pursuit of happiness in the tales means they"
      },
      {
        "questionId": "q14",
        "text": "Bruno Bettelheim said the therapeutic value of the tales means that the fairy tales"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p2-high-120": {
    "groupId": "group-2",
    "kind": "people",
    "questionIds": [
      "q8",
      "q9",
      "q10"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Good tenant management involves supervision and regulation."
      },
      {
        "value": "B",
        "label": "B State housing must be built at minimum expense to the public."
      },
      {
        "value": "C",
        "label": "C Organising social events helps tenants to live close together."
      },
      {
        "value": "D",
        "label": "D Mixed-race communities require adaptable and responsive designs."
      },
      {
        "value": "E",
        "label": "E Complaints were expected about the high standard of the development."
      },
      {
        "value": "F",
        "label": "F Too many rules and regulations will cause resentment from tenants."
      }
    ],
    "statements": [
      {
        "questionId": "q8",
        "text": "James Lundy"
      },
      {
        "questionId": "q9",
        "text": "Graham Bodman"
      },
      {
        "questionId": "q10",
        "text": "Stuart Bracey"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each person with the correct idea below.",
    "poolTitle": "List of Ideas"
  },
  "p2-low-147": {
    "groupId": "group-3",
    "kind": "people",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13"
    ],
    "options": [
      {
        "value": "A",
        "label": "A Thomas Mendenhall"
      },
      {
        "value": "B",
        "label": "B Ward Elliott and Robert Valenza"
      },
      {
        "value": "C",
        "label": "C Professor Kate McCluskey"
      },
      {
        "value": "D",
        "label": "D Dr Thomas Merriam"
      },
      {
        "value": "E",
        "label": "E Dr Markus Dahl"
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "People search for a more distinguished author because they cannot accept that a normal individual could write such brilliant plays."
      },
      {
        "questionId": "q11",
        "text": "It should be possible to recognise writers by examining the number of letters in the words they use."
      },
      {
        "questionId": "q12",
        "text": "The fact that Shakespeare's works are likely to have been altered over the years raises doubts about any stylometric analysis."
      },
      {
        "questionId": "q13",
        "text": "Analysis proves that Shakespeare's style differs from those of writers who have been suggested as the authors of the plays."
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Match each statement with the correct person below.",
    "poolTitle": "List of People"
  },
  "p3-high-178": {
    "groupId": "group-3",
    "kind": "endings",
    "questionIds": [
      "q10",
      "q11",
      "q12",
      "q13",
      "q14"
    ],
    "options": [
      {
        "value": "A",
        "label": "A comparing the brains of people who had never played an instrument with those who played for a living."
      },
      {
        "value": "B",
        "label": "B activating many different parts of the brain at the same time."
      },
      {
        "value": "C",
        "label": "C teaching a group of older people to play an instrument."
      },
      {
        "value": "D",
        "label": "D acquiring the particular set of physical skills needed to play an instrument."
      },
      {
        "value": "E",
        "label": "E discovering which group of people becomes the best musicians."
      },
      {
        "value": "F",
        "label": "F having played an instrument for a considerable length of time."
      }
    ],
    "statements": [
      {
        "questionId": "q10",
        "text": "Brenda Hanna-Pladdy believes the cognitive benefits of music lessons are a result of"
      },
      {
        "questionId": "q11",
        "text": "The research undertaken by Gottfried Schlaug focused on"
      },
      {
        "questionId": "q12",
        "text": "According to Alison Balbag, playing an instrument is a unique experience because it involves"
      },
      {
        "questionId": "q13",
        "text": "Nina Kraus believes there is a link between better hearing in later life and the experience of"
      },
      {
        "questionId": "q14",
        "text": "Jennifer Bugos's study involved"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  },
  "p3-low-74": {
    "groupId": "group-1",
    "kind": "endings",
    "questionIds": [
      "q1",
      "q2",
      "q3",
      "q4",
      "q5"
    ],
    "options": [
      {
        "value": "A",
        "label": "A should be easy to understand"
      },
      {
        "value": "B",
        "label": "B can improve without treatment"
      },
      {
        "value": "C",
        "label": "C can cost the patient less"
      },
      {
        "value": "D",
        "label": "D ought to last a minimum length of time"
      },
      {
        "value": "E",
        "label": "E can require a range of different products"
      },
      {
        "value": "F",
        "label": "F can be described as serious"
      },
      {
        "value": "G",
        "label": "G should give it greater recognition"
      },
      {
        "value": "H",
        "label": "H should be able to get a high income"
      }
    ],
    "statements": [
      {
        "questionId": "q1",
        "text": "An appointment with an alternative practitioner"
      },
      {
        "questionId": "q2",
        "text": "An alternative practitioner's explanation of their treatment"
      },
      {
        "questionId": "q3",
        "text": "If alternative practitioners have faith in their treatment, they"
      },
      {
        "questionId": "q4",
        "text": "Quite often, a patient's illness"
      },
      {
        "questionId": "q5",
        "text": "Conventional doctors are aware of the placebo effect and they"
      }
    ],
    "allowOptionReuse": false,
    "instruction": "Complete each sentence with the correct ending below.",
    "poolTitle": "List of Endings"
  }
}
