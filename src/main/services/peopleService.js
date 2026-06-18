class PeopleService {
  constructor(settingsService, peopleRepository) {
    this.settingsService = settingsService;
    this.peopleRepository = peopleRepository;
  }

  async list() {
    const settings = await this.settingsService.get();
    if (!settings.peopleExists) {
      throw new Error(`사람 데이터 파일을 찾을 수 없습니다: ${settings.peoplePath}`);
    }

    return this.peopleRepository.list(settings.peoplePath);
  }

  async findByKey(key) {
    const people = await this.list();
    return people.find((person) => person.key === String(key));
  }
}

module.exports = {
  PeopleService
};
