import * as Vue from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import { mixin } from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from 'https://graffiti.garden/graffiti-js/plugins/vue/plugin.js'
import Resolver from './resolver.js'

const app = {

  watch: {
    async messages(messages) {
      const messageImages = 
      messages.filter(m=>
        // Does the message have a type property?
        m.attachment         &&
        typeof m.attachment=='object' &&
        m.attachment.magnet     &&
        typeof m.attachment.magnet=='string' &&
        m.attachment.type    &&
        m.attachment.type=='Image') 
        
        for (const message of messageImages) {
          if (message.attachment.magnet in this.downloadedImages) {
            continue;
          }
          console.log("downloading image: " + message.attachment.magnet);
          this.downloadedImages[message.attachment.magnet] = true;
          const imageblob = await this.$gf.media.fetch(message.attachment.magnet);
          this.downloadedImages[message.attachment.magnet] = URL.createObjectURL(imageblob)
        }
    }
  },

  // Import MaVue
  mixins: [mixin],

  // Import resolver
  created() {
    this.resolver = new Resolver(this.$gf)
    this.$gf.events.addEventListener("connected", async ()=> {
      this.myUsername = await this.resolver.actorToUsername(this.$gf.me)
    })
  },

  setup() {
    // Initialize the name of the channel we're chatting in
    const channel = Vue.ref('sharon')

    // And a flag for whether or not we're private-messaging
    const privateMessaging = Vue.ref(false)

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject('graffiti')
    const context = Vue.computed(()=> privateMessaging.value? [$gf.me] : [channel.value])

    // Initialize the collection of messages associated with the context
    const { objects: messagesRaw } = $gf.useObjects(context)
    console.log(messagesRaw)
    return { channel, privateMessaging, messagesRaw }
  },

  data() {
    // Initialize some more reactive variables
    return {
      messageText: '',
      editID: '',
      editText: '',
      recipient: '',
      requestUsername: '',
      preferredUsername: '',
      usernameResult: '',
      actorID: '',
      myUsername: '',
      usernameLookup: [],
      downloadedImages: {},
    }
  },



  computed: {
    messages() {
      let messages = this.messagesRaw
        // Filter the "raw" messages for data
        // that is appropriate for our application
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
        .filter(m=>
          // Does the message have a type property?
          m.type         &&
          // Is the value of that property 'Note'?
          m.type=='Note' &&
          // Does the message have a content property?
          m.content      &&
          // Is that property a string?
          typeof m.content=='string') 

      // Do some more filtering for private messaging
      if (this.privateMessaging) {
        
        messages = messages.filter(m=>
          // Is the message private?
          m.bto &&
          // Is the message to exactly one person?
          m.bto.length == 1 &&
          (
            // Is the message to the recipient?
            m.bto[0] == this.actorID ||
            // Or is the message from the recipient?
            m.actor == this.actorID
          )
        )
      }

      return messages
        // Sort the messages with the
        // most recently created ones first
        .sort((m1, m2)=> new Date(m2.published) - new Date(m1.published))
        // Only show the 10 most recent ones
        .slice(0,10)
    },
  },

  methods: {

    async onImageAttachment(event) {
      console.log(this);
      const file = event.target.files[0]
      console.log(file.name);
      this.file = file;
    },

    searchRecipient() {
      let progress = document.getElementById("progress");
      progress.innerHTML = "Searching...";
      this.actorID = '';
      this.resolver.usernameToActor(this.recipient).then((result) => {
        if (result) { 
          // alert("result: " + this.recipient);
          this.actorID = result;
          progress.innerHTML = "&nbsp;";
        }
      }).catch((error) => {
        alert("error: " + error);
        progress.innerHTML = "&nbsp;";
      }).finally(() => {
        if (this.actorID == '') {
          progress.innerHTML = "Username not found";
        }
      });
    },

    updateUsernameinpage(actorID, username) {
      // console.log("updateusernameinpage" + "actorID: " + actorID + "username: " + username);
      let x = document.querySelectorAll(".username");
      var i;
      for (i = 0; i < x.length; i++) {
        if (x[i].innerHTML === actorID) {
          x[i].innerHTML = username;
        }
      }
    },

    getUsername(actorID) {
      if (this.usernameLookup[actorID]) {
        // this.updateUsernameinpage(actorID, this.usernameLookup[actorID]);
        return this.usernameLookup[actorID];
      }

      this.usernameLookup[actorID] = actorID;
      this.resolver.actorToUsername(actorID).then((result) => {
        if (result) {
          this.usernameLookup[actorID] = result;
          // console.log("result: " + result + "actorID: " + actorID);
          this.updateUsernameinpage(actorID, result);
          // return result;
        }
        else {
          // this.usernameLookup[actorID] = "Not Found";
          this.updateUsernameinpage(actorID, actorID);
        }
      });
      return "Not Found";
    },

    async sendMessage() {
      const message = {
        type: 'Note',
        content: this.messageText,
      }

      // The context field declares which
      // channel(s) the object is posted in
      // You can post in more than one if you want!
      // The bto field makes messages private
      if (this.privateMessaging) {
        message.bto = [this.actorID]
        message.context = [this.$gf.me, this.actorID]
      } else {
        message.context = [this.channel]
      }

      if(this.file) {
        const magnet = await this.$gf.media.store(this.file)
        message.attachment = {type: 'Image', magnet: magnet}
      }

      // Send!
      this.$gf.post(message)
      this.messageText = '';
      this.file = null;
    },

    removeMessage(message) {
      this.$gf.remove(message)
    },

    startEditMessage(message) {
      // Mark which message we're editing
      this.editID = message.id
      // And copy over it's existing text
      this.editText = message.content
    },

    saveEditMessage(message) {
      // Save the text (which will automatically
      // sync with the server)
      message.content = this.editText
      // And clear the edit mark
      this.editID = ''
    },
  }
}

const Name = {
  props: ['actor', 'editable'],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },

  computed: {
    profile() {
      return this.objects
        // Filter the raw objects for profile data
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
        .filter(m=>
          // Does the message have a type property?
          m.type &&
          // Is the value of that property 'Profile'?
          m.type=='Profile' &&
          // Does the message have a name property?
          m.name &&
          // Is that property a string?
          typeof m.name=='string')
        // Choose the most recent one or null if none exists
        .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },

  data() {
    return {
      editing: false,
      editText: ''
    }
  },

  methods: {
    editName() {
      this.editing = true
      // If we already have a profile,
      // initialize the edit text to our existing name
      this.editText = this.profile? this.profile.name : this.editText
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name
        // (this will sync automatically)
        this.profile.name = this.editText
      } else {
        // Otherwise create a profile
        this.$gf.post({
          type: 'Profile',
          name: this.editText
        })
      }

      // Exit the editing state
      this.editing = false
    }
  },

  template: '#name'
}


const Like = {
  props: ["messageid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    const { objects: likesRaw } = $gf.useObjects([messageid])
    return { likesRaw }
  },

  computed: {
    likes() {
      return this.likesRaw.filter(l=>
        l.type == 'Like' &&
        l.object == this.messageid)
    },

    numLikes() {
      // Unique number of actors
      return [...new Set(this.likes.map(l=>l.actor))].length
    },

    myLikes() {
      return this.likes.filter(l=> l.actor == this.$gf.me)
    }
  },

  methods: {
    toggleLike() {
      if (this.myLikes.length) {
        this.$gf.remove(...this.myLikes)
      } else {
        this.$gf.post({
          type: 'Like',
          object: this.messageid,
          context: [this.messageid]
        })
      }
    }
  },

  template: '#like'
}

const Read = {
  props: ["readid"],

  setup(props) {
    const $gf = Vue.inject('graffiti')
    const readid = Vue.toRef(props, 'readid')
    const { objects: readRaw } = $gf.useObjects([readid])
    return { readRaw }
  },

  created() {
    this.resolver = new Resolver(this.$gf)
  },

  data() {
    return {
      usernames: [],
    }
  },

  mounted() {
    if (!this.myRead.length){
      this.$gf.post({
        type: 'Read',
        object: this.readid,
        context: [this.readid]
      })
    }
  },

  computed: {
    read() {
      return [...new Set(this.readRaw.filter(r=>
        r.type == 'Read' &&
        r.object == this.readid).map(r=>r.actor))].sort()
    },


    myRead() {
      return this.read.filter(r=> r.actor == this.$gf.me)
    }

  },

  watch: {
    read() {
      // Promise.allSettled(this.read.map(this.resolver.actorToUsername)).then(usernames => this.usernames = usernames)
      this.usernames = []

      this.read.forEach(async r => {
        const username = await this.resolver.actorToUsername(r);
        this.usernames.push(username);
      })
    }
  },

  template: '#read'
}

const Reply = {
  props: ["messageid"],
  setup(props) {
    const $gf = Vue.inject('graffiti')
    const messageid = Vue.toRef(props, 'messageid')
    const { objects: repliesRaw } = $gf.useObjects([messageid])
    console.log(repliesRaw)
    return { repliesRaw }
  },

  data () {
    return {
      messageText: '',
      usernameLookup: {},
    }
  },


  computed: {
    replies() {
      let replies = this.repliesRaw
        // Filter the "raw" messages for data
        // that is appropriate for our application
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
        .filter(r=>
          // Does the message have a type property?
          r.type         &&
          // Is the value of that property 'Note'?
          r.type=='Note' &&
          // Does the message have a content property?
          r.content      &&
          r.inReplyTo    &&
          // Is that property a string?
          typeof r.content=='string') 

          return replies
        }
      },
      methods: {
        async sendMessage() {
          const message = {
            type: 'Note',
            content: this.messageText,
            inReplyTo: this.messageid,
            context: [this.messageid]
          }

          if(this.file) {
            const magnet = await this.$gf.media.store(this.file)
            message.attachment = {type: 'Image', magnet: magnet}
          }

          // Send!
          this.$gf.post(message)
          this.messageText = '';
          this.file = null;
        },

        removeMessage(message) {
          this.$gf.remove(message)
        },

        getUsername(actorID) {
          this.resolver = new Resolver(this.$gf)

          if (this.usernameLookup[actorID]) {
            // this.updateUsernameinpage(actorID, this.usernameLookup[actorID]);
            return this.usernameLookup[actorID];
          }
    
          this.usernameLookup[actorID] = actorID;
          this.resolver.actorToUsername(actorID).then((result) => {
            if (result) {
              this.usernameLookup[actorID] = result;
              // console.log("result: " + result + "actorID: " + actorID);
              this.updateUsernameinpage(actorID, result);
              // return result;
            }
            else {
              // this.usernameLookup[actorID] = "Not Found";
              this.updateUsernameinpage(actorID, actorID);
            }
          });
          return "Not Found";
        },
    

      },

      template: '#reply'
    }


const Pro = {
  props: ['actor', 'editable'],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props)
    const $gf = Vue.inject('graffiti')
    return $gf.useObjects([actor])
  },
  
  computed: {
    profile() {
      return this.objects
        .filter(p=>
          p.type &&
          p.type=='Profile' &&
          p.icon &&
          p.icon.type &&
          p.icon.type=='Image' &&
          p.icon.magnet &&
          typeof p.icon.magnet=='string')
        .reduce((prev, curr)=> !prev || curr.published > prev.published? curr : prev, null)
    }
  },
    
  data() {
    return {
      editing: false,
      file: null,
      downloadedpfpImages: {},
    }
  },

  watch: {
    async profile(profile) {
      // const profileImage = 
      // profile.filter(p=>
      //   p.attachment         &&
      //   typeof p.attachment=='object' &&
      //   p.attachment.magnet     &&
      //   typeof p.attachment.magnet=='string' &&
      //   p.attachment.type    &&
      //   p.attachment.type=='Image') 
        
          if (profile.icon.magnet in this.downloadedpfpImages) {
            return
          }
          console.log("downloading image: " + profile.icon.magnet);
          this.downloadedpfpImages[profile.icon.magnet] = true;
          let imageblob;
          try {
            imageblob = await this.$gf.media.fetch(profile.icon.magnet);
          } catch (error) {
            "Oh no! Something went wrong."
          }
          this.downloadedpfpImages[profile.icon.magnet] = URL.createObjectURL(imageblob)
        
    }
  },

  methods: {
    async onProfileAttachment(event) {
      const file = event.target.files[0]
      console.log(file.name);
      this.file = file;
    },

    editPicture() {
      this.editing = true
    },

    async savePicture() {
      console.log("AAAAAAAAAAAAAAAAAAAAAA")
      const magnet = await this.$gf.media.store(this.file)
      console.log("magnet" + magnet);
      if (this.profile) {
        this.profile.icon = {type: 'Image', magnet: magnet}
        this.file = null;
      }
      else {
        this.$gf.post({
          type: 'Profile',
          icon: {type: 'Image', magnet: magnet}
        })
        this.file = null;
      }
      this.editing = false
    }
  },

  template: '#pro'
}

app.components = { Name, Like, Read, Reply, Pro }
Vue.createApp(app)
   .use(GraffitiPlugin(Vue))
   .mount('#app')
