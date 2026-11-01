/*
 * Nwjjyy 的内容入口。
 * 修改文字后保存、刷新即可；不需要构建，也不需要注册服务。
 * 图片与声音请使用相对路径，例如 "assets/images/our-photo.jpg"。
 * 照片、声音、日期目前均为占位，填写真实内容前请先确认公开授权。
 */
window.SITE_CONFIG = {
  title: "nwjjyy",
  welcome: "欢迎来到 nwjjyy 的小世界",
  subtitle: "这里藏着一些只属于我们的小惊喜。",

  bunny: {
    speech: "你咋这样！",
    surprise: "被你发现啦！"
  },

  audio: {
    // 添加自己的 MP3 文件后，将 enabled 改成 true。
    // false 时不会请求不存在的音频，也不会生成或播放替代声音。
    enabled: false,
    path: "assets/audio/ni-za-yang.mp3",
    title: "专属声音，待收藏",
    emptyText: "等一段特别的声音到来。"
  },

  memories: [
    {
      image: "", // 例如 "assets/images/our-photo.jpg"；留空显示原创占位图。
      alt: "",
      title: "等一张合照",
      caption: "先留一个位置，等喜欢的照片。"
    },
    {
      image: "",
      alt: "",
      title: "留住小日常",
      caption: "平常的一天，也值得好好收藏。"
    },
    {
      image: "",
      alt: "",
      title: "下一次出发",
      caption: "下一段故事，等以后慢慢写。"
    }
  ],

  note: {
    title: "留一页，给以后",
    text: "这里还没有写下故事。等一个值得记住的瞬间，再慢慢填上。"
  },

  anniversary: {
    // 格式必须为 YYYY-MM-DD，例如年-月-日；留空不会虚构日期。
    date: "",
    title: "属于我们的纪念日"
  }
};
